import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseQuery } from '@reporter/shared';
import { requireAuth, requireEngagementRole, HttpError } from '../../auth/guards.js';
import { parsePagination } from '../../helpers/pagination.js';
import { createEvidence, listEvidence } from '../../services/evidence.js';
import { evidenceInclude, serializeEvidence } from '../../services/serializers.js';
import { evidenceContentMime, parseEvidenceRequest } from '../shared-evidence.js';

async function engagementBySlug(app: FastifyInstance, slug: string) {
  return app.db.engagement.findUniqueOrThrow({ where: { slug } });
}

export async function evidenceRoutes(app: FastifyInstance): Promise<void> {
  // Timeline listing with filter query.
  app.get(
    '/engagements/:slug/evidence',
    { preHandler: [requireAuth, requireEngagementRole('read')] },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const query = (req.query as { q?: string }).q ?? '';
      const eng = await engagementBySlug(app, slug);
      return listEvidence(app, eng.id, slug, parseQuery(query), parsePagination(req.query as any));
    },
  );

  // Create evidence (multipart or JSON).
  app.post(
    '/engagements/:slug/evidence',
    { preHandler: [requireAuth, requireEngagementRole('write')] },
    async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const eng = await engagementBySlug(app, slug);
      const { metadata, file } = await parseEvidenceRequest(req);
      const evidence = await createEvidence(app, {
        engagementId: eng.id,
        engagementSlug: slug,
        operatorId: req.authedUser!.id,
        metadata,
        file,
      });
      reply.status(201);
      return evidence;
    },
  );

  // Distinct operators who have evidence in this engagement (powers the operator filter).
  // Declared before the `:uuid` handler so intent is clear; find-my-way also prioritizes
  // the static `operators` segment over the `:uuid` param.
  app.get(
    '/engagements/:slug/evidence/operators',
    { preHandler: [requireAuth, requireEngagementRole('read')] },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const eng = await engagementBySlug(app, slug);
      const users = await app.db.user.findMany({
        where: { evidence: { some: { engagementId: eng.id } } },
        select: { slug: true, firstName: true, lastName: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      });
      return users;
    },
  );

  app.get(
    '/engagements/:slug/evidence/:uuid',
    { preHandler: [requireAuth, requireEngagementRole('read')] },
    async (req) => {
      const { slug, uuid } = req.params as { slug: string; uuid: string };
      const eng = await engagementBySlug(app, slug);
      const ev = await app.db.evidence.findFirst({
        where: { uuid, engagementId: eng.id },
        include: evidenceInclude,
      });
      if (!ev) throw new HttpError(404, 'Evidence not found');
      return serializeEvidence(ev, slug);
    },
  );

  // Serve the full blob content.
  app.get(
    '/engagements/:slug/evidence/:uuid/content',
    { preHandler: [requireAuth, requireEngagementRole('read')] },
    async (req, reply) => {
      const { slug, uuid } = req.params as { slug: string; uuid: string };
      const eng = await engagementBySlug(app, slug);
      const ev = await app.db.evidence.findFirst({ where: { uuid, engagementId: eng.id } });
      if (!ev || !ev.fullBlobKey) throw new HttpError(404, 'No content for this evidence');
      const blob = await app.blobs.getBuffer(ev.fullBlobKey);
      reply.header('Content-Type', evidenceContentMime(ev.contentType, blob));
      reply.header('Cache-Control', 'private, max-age=3600');
      return reply.send(blob);
    },
  );

  // Serve the thumbnail (images only).
  app.get(
    '/engagements/:slug/evidence/:uuid/thumbnail',
    { preHandler: [requireAuth, requireEngagementRole('read')] },
    async (req, reply) => {
      const { slug, uuid } = req.params as { slug: string; uuid: string };
      const eng = await engagementBySlug(app, slug);
      const ev = await app.db.evidence.findFirst({ where: { uuid, engagementId: eng.id } });
      if (!ev || !ev.thumbBlobKey) throw new HttpError(404, 'No thumbnail');
      const blob = await app.blobs.getBuffer(ev.thumbBlobKey);
      reply.header('Content-Type', 'image/jpeg');
      reply.header('Cache-Control', 'private, max-age=86400');
      return reply.send(blob);
    },
  );

  // Update description / tags / occurredAt.
  app.put(
    '/engagements/:slug/evidence/:uuid',
    { preHandler: [requireAuth, requireEngagementRole('write')] },
    async (req) => {
      const { slug, uuid } = req.params as { slug: string; uuid: string };
      const eng = await engagementBySlug(app, slug);
      const body = z
        .object({
          description: z.string().optional(),
          occurredAt: z.string().datetime({ offset: true }).optional(),
          tagIds: z.array(z.number().int().positive()).optional(),
        })
        .parse(req.body);

      const ev = await app.db.evidence.findFirst({ where: { uuid, engagementId: eng.id } });
      if (!ev) throw new HttpError(404, 'Evidence not found');

      await app.db.$transaction(async (tx) => {
        await tx.evidence.update({
          where: { id: ev.id },
          data: {
            description: body.description ?? undefined,
            occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
          },
        });
        if (body.tagIds) {
          const valid = await tx.tag.findMany({
            where: { id: { in: body.tagIds }, engagementId: eng.id },
            select: { id: true },
          });
          await tx.evidenceTag.deleteMany({ where: { evidenceId: ev.id } });
          await tx.evidenceTag.createMany({
            data: valid.map((t) => ({ evidenceId: ev.id, tagId: t.id })),
          });
        }
      });

      const updated = await app.db.evidence.findUniqueOrThrow({
        where: { id: ev.id },
        include: evidenceInclude,
      });
      return serializeEvidence(updated, slug);
    },
  );

  app.delete(
    '/engagements/:slug/evidence/:uuid',
    { preHandler: [requireAuth, requireEngagementRole('write')] },
    async (req) => {
      const { slug, uuid } = req.params as { slug: string; uuid: string };
      const eng = await engagementBySlug(app, slug);
      const ev = await app.db.evidence.findFirst({ where: { uuid, engagementId: eng.id } });
      if (!ev) throw new HttpError(404, 'Evidence not found');
      await app.db.evidence.delete({ where: { id: ev.id } });
      if (ev.fullBlobKey) await app.blobs.delete(ev.fullBlobKey).catch(() => {});
      if (ev.thumbBlobKey) await app.blobs.delete(ev.thumbBlobKey).catch(() => {});
      return { ok: true };
    },
  );
}
