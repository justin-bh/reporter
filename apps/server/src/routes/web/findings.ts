import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createFindingInput,
  reorderInput,
  scoreVector,
  updateFindingInput,
} from '@reporter/shared';
import { HttpError, requireAuth, requireEngagementRole } from '../../auth/guards.js';
import {
  evidenceInclude,
  serializeEvidence,
  serializeFinding,
} from '../../services/serializers.js';

const findingInclude = {
  category: true,
  _count: { select: { evidence: true } },
} as const;

async function categoryIdFor(app: FastifyInstance, name: string | null): Promise<number | null> {
  if (!name) return null;
  const cat = await app.db.findingCategory.upsert({
    where: { category: name },
    create: { category: name },
    update: {},
  });
  return cat.id;
}

export async function findingRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/engagements/:slug/findings',
    { preHandler: [requireAuth, requireEngagementRole('read')] },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const findings = await app.db.finding.findMany({
        where: { engagementId: eng.id },
        include: findingInclude,
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      });
      return findings.map((f) => serializeFinding(f, slug));
    },
  );

  app.post(
    '/engagements/:slug/findings',
    { preHandler: [requireAuth, requireEngagementRole('write')] },
    async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const input = createFindingInput.parse(req.body);
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      // New findings append to the end of the manual order. This read-then-write
      // isn't atomic: two simultaneous creates in one engagement can land on the
      // same position. The impact is only a cosmetic tie (list order falls back to
      // createdAt) and a reorder rewrites positions cleanly, so we don't lock here.
      const max = await app.db.finding.aggregate({
        where: { engagementId: eng.id },
        _max: { position: true },
      });
      const finding = await app.db.finding.create({
        data: {
          engagementId: eng.id,
          title: input.title,
          description: input.description,
          categoryId: await categoryIdFor(app, input.category),
          position: (max._max.position ?? -1) + 1,
        },
        include: findingInclude,
      });
      reply.status(201);
      return serializeFinding(finding, slug);
    },
  );

  app.get(
    '/engagements/:slug/findings/:uuid',
    { preHandler: [requireAuth, requireEngagementRole('read')] },
    async (req) => {
      const { slug, uuid } = req.params as { slug: string; uuid: string };
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const finding = await app.db.finding.findFirst({
        where: { uuid, engagementId: eng.id },
        include: findingInclude,
      });
      if (!finding) throw new HttpError(404, 'Finding not found');
      const links = await app.db.evidenceFinding.findMany({
        where: { findingId: finding.id },
        include: { evidence: { include: evidenceInclude } },
        orderBy: [{ position: 'asc' }, { evidenceId: 'asc' }],
      });
      return {
        ...serializeFinding(finding, slug),
        evidence: links.map((l) => serializeEvidence(l.evidence, slug)),
      };
    },
  );

  app.put(
    '/engagements/:slug/findings/:uuid',
    { preHandler: [requireAuth, requireEngagementRole('write')] },
    async (req) => {
      const { slug, uuid } = req.params as { slug: string; uuid: string };
      const body = updateFindingInput.parse(req.body);
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const finding = await app.db.finding.findFirst({ where: { uuid, engagementId: eng.id } });
      if (!finding) throw new HttpError(404, 'Finding not found');

      const data: {
        title?: string;
        description?: string;
        readyToReport?: boolean;
        ticketLink?: string | null;
        categoryId?: number | null;
        severity?: 'none' | 'low' | 'medium' | 'high' | 'critical' | null;
        cvssVector?: string | null;
        cvssScore?: number | null;
      } = {
        title: body.title ?? undefined,
        description: body.description ?? undefined,
        readyToReport: body.readyToReport ?? undefined,
        ticketLink: body.ticketLink === undefined ? undefined : body.ticketLink,
        categoryId:
          body.category === undefined ? undefined : await categoryIdFor(app, body.category),
      };

      // Severity / CVSS resolution:
      //  • A CVSS vector wins — the server derives score + severity from it so the
      //    number and label can never drift from the stored vector.
      //  • Clearing the vector (null) drops the score; a manual severity may
      //    accompany it. Otherwise a bare `severity` is a simple (manual) rating.
      if (typeof body.cvssVector === 'string') {
        const scored = scoreVector(body.cvssVector);
        if (!scored) throw new HttpError(400, 'Invalid CVSS vector');
        data.cvssVector = scored.vector;
        data.cvssScore = scored.score;
        data.severity = scored.severity;
      } else if (body.cvssVector === null) {
        data.cvssVector = null;
        data.cvssScore = null;
        if (body.severity !== undefined) data.severity = body.severity;
      } else if (body.severity !== undefined) {
        // A manual severity supersedes any stored vector — clear it so the label
        // can never drift from a stale score/vector.
        data.severity = body.severity;
        data.cvssVector = null;
        data.cvssScore = null;
      }

      const updated = await app.db.finding.update({
        where: { id: finding.id },
        data,
        include: findingInclude,
      });
      return serializeFinding(updated, slug);
    },
  );

  app.delete(
    '/engagements/:slug/findings/:uuid',
    { preHandler: [requireAuth, requireEngagementRole('write')] },
    async (req) => {
      const { slug, uuid } = req.params as { slug: string; uuid: string };
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const finding = await app.db.finding.findFirst({ where: { uuid, engagementId: eng.id } });
      if (!finding) throw new HttpError(404, 'Finding not found');
      await app.db.finding.delete({ where: { id: finding.id } });
      return { ok: true };
    },
  );

  // Attach/detach evidence to a finding.
  app.post(
    '/engagements/:slug/findings/:uuid/evidence',
    { preHandler: [requireAuth, requireEngagementRole('write')] },
    async (req) => {
      const { slug, uuid } = req.params as { slug: string; uuid: string };
      const { evidenceUuids } = z
        .object({ evidenceUuids: z.array(z.string().uuid()).min(1) })
        .parse(req.body);
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const finding = await app.db.finding.findFirst({ where: { uuid, engagementId: eng.id } });
      if (!finding) throw new HttpError(404, 'Finding not found');
      const evidence = await app.db.evidence.findMany({
        where: { uuid: { in: evidenceUuids }, engagementId: eng.id },
        select: { id: true },
      });
      // Append newly-attached evidence after any already attached.
      const existing = await app.db.evidenceFinding.findMany({
        where: { findingId: finding.id },
        select: { evidenceId: true, position: true },
      });
      const attachedIds = new Set(existing.map((e) => e.evidenceId));
      let nextPos = existing.reduce((m, e) => Math.max(m, e.position), -1) + 1;
      const toAttach = evidence.filter((e) => !attachedIds.has(e.id));
      await app.db.evidenceFinding.createMany({
        data: toAttach.map((e) => ({
          evidenceId: e.id,
          findingId: finding.id,
          position: nextPos++,
        })),
        skipDuplicates: true,
      });
      return { ok: true, attached: toAttach.length };
    },
  );

  // Reorder the findings within an engagement (drag-and-drop order).
  app.patch(
    '/engagements/:slug/findings/reorder',
    { preHandler: [requireAuth, requireEngagementRole('write')] },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const { orderedUuids } = reorderInput.parse(req.body);
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      // Load the full set: the order must list every finding exactly once, so
      // reassigning positions 0..n-1 can never collide with an omitted finding.
      const findings = await app.db.finding.findMany({
        where: { engagementId: eng.id },
        select: { id: true, uuid: true },
      });
      const idByUuid = new Map(findings.map((f) => [f.uuid, f.id]));
      if (idByUuid.size !== orderedUuids.length || orderedUuids.some((u) => !idByUuid.has(u))) {
        throw new HttpError(400, 'Order must list exactly the findings in this engagement');
      }
      await app.db.$transaction(
        orderedUuids.map((u, i) =>
          app.db.finding.update({ where: { id: idByUuid.get(u)! }, data: { position: i } }),
        ),
      );
      return { ok: true };
    },
  );

  // Reorder the evidence attached to a single finding.
  app.patch(
    '/engagements/:slug/findings/:uuid/evidence/reorder',
    { preHandler: [requireAuth, requireEngagementRole('write')] },
    async (req) => {
      const { slug, uuid } = req.params as { slug: string; uuid: string };
      const { orderedUuids } = reorderInput.parse(req.body);
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const finding = await app.db.finding.findFirst({ where: { uuid, engagementId: eng.id } });
      if (!finding) throw new HttpError(404, 'Finding not found');
      const links = await app.db.evidenceFinding.findMany({
        where: { findingId: finding.id },
        include: { evidence: { select: { uuid: true } } },
      });
      const idByUuid = new Map(links.map((l) => [l.evidence.uuid, l.evidenceId]));
      if (idByUuid.size !== orderedUuids.length || orderedUuids.some((u) => !idByUuid.has(u))) {
        throw new HttpError(400, 'Order must list exactly the evidence attached to this finding');
      }
      await app.db.$transaction(
        orderedUuids.map((u, i) =>
          app.db.evidenceFinding.update({
            where: {
              evidenceId_findingId: { evidenceId: idByUuid.get(u)!, findingId: finding.id },
            },
            data: { position: i },
          }),
        ),
      );
      return { ok: true };
    },
  );

  app.delete(
    '/engagements/:slug/findings/:uuid/evidence/:evidenceUuid',
    { preHandler: [requireAuth, requireEngagementRole('write')] },
    async (req) => {
      const { slug, uuid, evidenceUuid } = req.params as {
        slug: string;
        uuid: string;
        evidenceUuid: string;
      };
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const finding = await app.db.finding.findFirst({ where: { uuid, engagementId: eng.id } });
      const evidence = await app.db.evidence.findFirst({
        where: { uuid: evidenceUuid, engagementId: eng.id },
      });
      if (!finding || !evidence) throw new HttpError(404, 'Not found');
      await app.db.evidenceFinding
        .delete({
          where: { evidenceId_findingId: { evidenceId: evidence.id, findingId: finding.id } },
        })
        .catch(() => {});
      return { ok: true };
    },
  );
}
