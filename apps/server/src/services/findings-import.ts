/**
 * Import a findings export (report.json) into an engagement.
 *
 * Findings are upserted by uuid (so re-importing the same file is idempotent);
 * a uuid that already belongs to a *different* engagement is skipped to avoid
 * stealing another engagement's data. Evidence is matched by uuid: an existing
 * item is re-linked, an embedded item (contentBase64) is recreated with its
 * original uuid, and a reference-only item with no local copy is skipped. A
 * finding's evidence links are reconciled to exactly the file's set.
 *
 * The import is intentionally NOT wrapped in one transaction (blob writes are
 * side effects outside the DB, and imports can be large). It is instead
 * idempotent: if it fails partway, re-running the same file converges — created
 * findings become no-op updates and the rest are created.
 */
import type { FastifyInstance } from 'fastify';
import {
  MAX_IMPORT_FINDINGS,
  type FindingsExport,
  type FindingsImportResult,
} from '@reporter/shared';
import { HttpError } from '../auth/guards.js';
import { createEvidence } from './evidence.js';

interface EngagementRef {
  id: number;
  slug: string;
}

/** Cap on the total number of evidence items a single import may materialize. */
const MAX_IMPORT_TOTAL_EVIDENCE = 10_000;

async function categoryIdFor(app: FastifyInstance, name: string | null): Promise<number | null> {
  if (!name) return null;
  // Revive a soft-deleted category (matching the admin "create category" path) so
  // an import never links a finding to a hidden/zombie category.
  const cat = await app.db.findingCategory.upsert({
    where: { category: name },
    create: { category: name },
    update: { deletedAt: null },
  });
  return cat.id;
}

export async function importFindings(
  app: FastifyInstance,
  eng: EngagementRef,
  data: FindingsExport,
  operatorId: number,
): Promise<FindingsImportResult> {
  // Bound total work up front (before any writes) so a crafted file can't
  // materialize an unbounded number of rows/blobs. Per-array caps are enforced
  // by the schema (MAX_IMPORT_FINDINGS / MAX_IMPORT_EVIDENCE_PER_FINDING).
  const totalEvidence = data.findings.reduce((n, f) => n + f.evidence.length, 0);
  if (data.findings.length > MAX_IMPORT_FINDINGS || totalEvidence > MAX_IMPORT_TOTAL_EVIDENCE) {
    throw new HttpError(413, 'Import is too large');
  }

  const result: FindingsImportResult = {
    findingsCreated: 0,
    findingsUpdated: 0,
    findingsSkipped: 0,
    evidenceCreated: 0,
    evidenceLinked: 0,
    evidenceSkipped: 0,
  };

  for (const f of data.findings) {
    const existing = await app.db.finding.findUnique({
      where: { uuid: f.uuid },
      select: { id: true, engagementId: true },
    });
    if (existing && existing.engagementId !== eng.id) {
      result.findingsSkipped++;
      continue;
    }

    const findingData = {
      title: f.title,
      description: f.description,
      remediation: f.remediation,
      categoryId: await categoryIdFor(app, f.category),
      severity: f.severity,
      cvssVector: f.cvssVector,
      cvssScore: f.cvssScore,
      readyToReport: f.readyToReport,
      position: f.position,
    };

    let findingId: number;
    if (existing) {
      await app.db.finding.update({ where: { id: existing.id }, data: findingData });
      findingId = existing.id;
      result.findingsUpdated++;
    } else {
      const created = await app.db.finding.create({
        data: { uuid: f.uuid, engagementId: eng.id, ...findingData },
        select: { id: true },
      });
      findingId = created.id;
      result.findingsCreated++;
    }

    const keptEvidenceIds: number[] = [];
    // Positions are per-bucket (Attack Path vs Attached Evidence), so track the
    // next slot in each bucket independently rather than using the array index.
    const bucketNext = { path: 0, attached: 0 };
    for (let i = 0; i < f.evidence.length; i++) {
      const ev = f.evidence[i]!;
      let evRow = await app.db.evidence.findUnique({
        where: { uuid: ev.uuid },
        select: { id: true, engagementId: true },
      });

      if (evRow && evRow.engagementId !== eng.id) {
        result.evidenceSkipped++;
        continue;
      }

      if (!evRow) {
        if (!ev.contentBase64) {
          // Reference-only export with no local copy of this evidence.
          result.evidenceSkipped++;
          continue;
        }
        await createEvidence(app, {
          engagementId: eng.id,
          engagementSlug: eng.slug,
          operatorId,
          uuid: ev.uuid,
          metadata: {
            description: ev.description,
            contentType: ev.contentType,
            contentSubtype: ev.contentSubtype ?? undefined,
            occurredAt: ev.occurredAt,
            tagIds: [],
          },
          file: {
            data: Buffer.from(ev.contentBase64, 'base64'),
            mimeType: 'application/octet-stream',
            filename: ev.uuid,
          },
        });
        evRow = await app.db.evidence.findUnique({
          where: { uuid: ev.uuid },
          select: { id: true, engagementId: true },
        });
        if (!evRow) {
          result.evidenceSkipped++;
          continue;
        }
        result.evidenceCreated++;
      } else {
        result.evidenceLinked++;
      }

      const inPath = ev.inPath;
      const position = inPath ? bucketNext.path++ : bucketNext.attached++;
      await app.db.evidenceFinding.upsert({
        where: { evidenceId_findingId: { evidenceId: evRow.id, findingId } },
        create: { evidenceId: evRow.id, findingId, position, caption: ev.caption, inPath },
        update: { position, caption: ev.caption, inPath },
      });
      keptEvidenceIds.push(evRow.id);
    }

    // Converge: drop any previously-linked evidence that's no longer in the file
    // (so re-importing an edited export detaches removed evidence too).
    await app.db.evidenceFinding.deleteMany({
      where:
        keptEvidenceIds.length === 0
          ? { findingId }
          : { findingId, evidenceId: { notIn: keptEvidenceIds } },
    });
  }

  return result;
}
