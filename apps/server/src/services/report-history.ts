/**
 * Report history: the audit trail behind the Reports tab. Every time a report
 * document (PDF or ZIP) is generated we record a `GeneratedReport` row — the
 * report itself isn't stored (it renders on demand), but the row snapshots the
 * findings tallies so an attestation letter issued later stays consistent with
 * the report as generated. Recording is best-effort: callers wrap it so a
 * history hiccup never fails the actual download.
 */
import type { FastifyInstance } from 'fastify';
import type { GeneratedReport as GeneratedReportRow, Prisma } from '@prisma/client';
import {
  REPORT_PRESET_LABELS,
  generatedReportSchema,
  type GeneratedReport,
  type GeneratedReportFormat,
  type ReportPreset,
} from '@reporter/shared';
import { computeReportSummary, type ReportOptions } from './findings-report.js';

/**
 * Namespace for the per-engagement Postgres advisory lock that serializes report
 * version assignment. Arbitrary, but distinct so it can't collide with any other
 * advisory lock the app might take.
 */
const REPORT_VERSION_LOCK_NS = 918_273;

interface RecordArgs {
  eng: { id: number; slug: string; name: string };
  /** The report "type" (drives the recorded label). */
  preset: ReportPreset;
  format: GeneratedReportFormat;
  /** The exact options the report was rendered with, so the snapshot matches. */
  options: ReportOptions;
  /** The operator who generated the report (null-safe: SET NULL on user delete). */
  userId: number;
}

/**
 * Record that a report was generated. `version` counts up per engagement
 * (`v1.0`, `v2.0`, …) so an attestation letter can name the exact deliverable.
 */
export async function recordGeneratedReport(
  app: FastifyInstance,
  { eng, preset, format, options, userId }: RecordArgs,
): Promise<void> {
  const summary = await computeReportSummary(app, eng, options);
  // Serialize per-engagement so two concurrent generations (e.g. a PDF and a ZIP
  // back-to-back) can't read the same count and mint duplicate version labels.
  // The transaction-scoped advisory lock is released automatically at commit.
  await app.db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REPORT_VERSION_LOCK_NS}::int4, ${eng.id}::int4)`;
    const priorCount = await tx.generatedReport.count({ where: { engagementId: eng.id } });
    await tx.generatedReport.create({
      data: {
        engagementId: eng.id,
        preset,
        label: REPORT_PRESET_LABELS[preset],
        version: `v${priorCount + 1}.0`,
        format,
        summary: summary as unknown as Prisma.InputJsonValue,
        generatedById: userId,
      },
    });
  });
}

/** Recent report generations for an engagement, newest first (for the UI). */
export async function listReportHistory(
  app: FastifyInstance,
  engagementId: number,
): Promise<GeneratedReport[]> {
  const rows = await app.db.generatedReport.findMany({
    where: { engagementId },
    orderBy: { createdAt: 'desc' },
    include: { generatedBy: true },
  });
  return rows.map((r) =>
    generatedReportSchema.parse({
      uuid: r.uuid,
      preset: r.preset,
      label: r.label,
      version: r.version,
      format: r.format,
      summary: r.summary,
      generatedBy: r.generatedBy
        ? `${r.generatedBy.firstName} ${r.generatedBy.lastName}`.trim()
        : null,
      createdAt: r.createdAt.toISOString(),
    }),
  );
}

/**
 * Resolve the report an attestation letter should attest to: the named one
 * (scoped to the engagement) or, absent a uuid, the most recent. Returns null
 * when the engagement has no report history yet — the letter is gated on this.
 */
export function findReportForLetter(
  app: FastifyInstance,
  engagementId: number,
  reportUuid?: string,
): Promise<GeneratedReportRow | null> {
  return app.db.generatedReport.findFirst({
    where: { engagementId, ...(reportUuid ? { uuid: reportUuid } : {}) },
    orderBy: { createdAt: 'desc' },
  });
}
