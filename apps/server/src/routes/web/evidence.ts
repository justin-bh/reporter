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
      return listEvidence(
        app,
        eng.id,
        slug,
        parseQuery(query),
        parsePagination(req.query as any),
        req.authedUser!.id,
      );
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
        include: evidenceInclude(req.authedUser!.id),
      });
      if (!ev) throw new HttpError(404, 'Evidence not found');
      return serializeEvidence(ev, slug);
    },
  );

  // Star / unstar a piece of evidence for the current user. Read-only members
  // may star too — it's a personal marker, like engagement favorites.
  app.post(
    '/engagements/:slug/evidence/:uuid/star',
    { preHandler: [requireAuth, requireEngagementRole('read')] },
    async (req) => {
      const { slug, uuid } = req.params as { slug: string; uuid: string };
      const { starred } = z.object({ starred: z.boolean() }).parse(req.body);
      const eng = await engagementBySlug(app, slug);
      const ev = await app.db.evidence.findFirst({
        where: { uuid, engagementId: eng.id },
        select: { id: true },
      });
      if (!ev) throw new HttpError(404, 'Evidence not found');
      await app.db.userEvidencePref.upsert({
        where: { userId_evidenceId: { userId: req.authedUser!.id, evidenceId: ev.id } },
        create: { userId: req.authedUser!.id, evidenceId: ev.id, isFavorite: starred },
        update: { isFavorite: starred },
      });
      return { starred };
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

  // List the comments (linked evidence) attached to this piece of evidence,
  // oldest first — a chronological thread of follow-ups/updates.
  app.get(
    '/engagements/:slug/evidence/:uuid/comments',
    { preHandler: [requireAuth, requireEngagementRole('read')] },
    async (req) => {
      const { slug, uuid } = req.params as { slug: string; uuid: string };
      const eng = await engagementBySlug(app, slug);
      const parent = await app.db.evidence.findFirst({
        where: { uuid, engagementId: eng.id },
        select: { id: true },
      });
      if (!parent) throw new HttpError(404, 'Evidence not found');
      const comments = await app.db.evidence.findMany({
        where: { parentEvidenceId: parent.id },
        include: evidenceInclude(req.authedUser!.id),
        orderBy: { occurredAt: 'asc' },
      });
      return comments.map((c) => serializeEvidence(c, slug));
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
        include: evidenceInclude(req.authedUser!.id),
      });
      return serializeEvidence(updated, slug);
    },
  );

  // Delete evidence. When it has comments (linked evidence), `?comments=` decides
  // their fate: `cascade` deletes them too; `orphan` (default) promotes them to
  // top-level evidence via the SetNull self-relation, preserving their content.
  app.delete(
    '/engagements/:slug/evidence/:uuid',
    { preHandler: [requireAuth, requireEngagementRole('write')] },
    async (req) => {
      const { slug, uuid } = req.params as { slug: string; uuid: string };
      const mode =
        (req.query as { comments?: string }).comments === 'cascade' ? 'cascade' : 'orphan';
      const eng = await engagementBySlug(app, slug);
      const ev = await app.db.evidence.findFirst({ where: { uuid, engagementId: eng.id } });
      if (!ev) throw new HttpError(404, 'Evidence not found');

      // Blobs to reclaim once the rows are gone: always the target's own; plus each
      // comment's when cascading (orphaned comments keep their content).
      const blobKeys: (string | null)[] = [ev.fullBlobKey, ev.thumbBlobKey];

      if (mode === 'cascade') {
        // Read the comments here so the rows we delete and the blobs we reclaim come
        // from the same set. A comment created concurrently (after this read) isn't
        // in the list; the parent delete's SetNull promotes it to top-level with its
        // blob intact rather than leaking it.
        const comments = await app.db.evidence.findMany({
          where: { parentEvidenceId: ev.id },
          select: { id: true, fullBlobKey: true, thumbBlobKey: true },
        });
        for (const c of comments) blobKeys.push(c.fullBlobKey, c.thumbBlobKey);
        await app.db.$transaction([
          app.db.evidence.deleteMany({ where: { id: { in: comments.map((c) => c.id) } } }),
          app.db.evidence.delete({ where: { id: ev.id } }),
        ]);
      } else {
        // orphan: deleting the parent nulls each comment's parentEvidenceId.
        await app.db.evidence.delete({ where: { id: ev.id } });
      }

      for (const key of blobKeys) if (key) await app.blobs.delete(key).catch(() => {});
      return { ok: true };
    },
  );
}
