import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createTagInput } from '@reporter/shared';
import { HttpError, requireAuth, requireEngagementRole } from '../../auth/guards.js';
import { serializeTag } from '../../services/serializers.js';

export async function tagRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/engagements/:slug/tags',
    { preHandler: [requireAuth, requireEngagementRole('read')] },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const tags = await app.db.tag.findMany({
        where: { engagementId: eng.id },
        orderBy: { name: 'asc' },
      });
      return tags.map(serializeTag);
    },
  );

  app.post(
    '/engagements/:slug/tags',
    { preHandler: [requireAuth, requireEngagementRole('write')] },
    async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const input = createTagInput.parse(req.body);
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const existing = await app.db.tag.findUnique({
        where: { engagementId_name: { engagementId: eng.id, name: input.name } },
      });
      if (existing) throw new HttpError(409, 'A tag with that name already exists');
      const tag = await app.db.tag.create({
        data: { engagementId: eng.id, name: input.name, colorName: input.colorName },
      });
      reply.status(201);
      return serializeTag(tag);
    },
  );

  app.put(
    '/engagements/:slug/tags/:id',
    { preHandler: [requireAuth, requireEngagementRole('write')] },
    async (req) => {
      const { slug, id } = req.params as { slug: string; id: string };
      const body = z
        .object({ name: z.string().min(1).max(64).optional(), colorName: z.string().optional() })
        .parse(req.body);
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const tag = await app.db.tag.findFirst({ where: { id: Number(id), engagementId: eng.id } });
      if (!tag) throw new HttpError(404, 'Tag not found');
      const updated = await app.db.tag.update({ where: { id: tag.id }, data: body });
      return serializeTag(updated);
    },
  );

  app.delete(
    '/engagements/:slug/tags/:id',
    { preHandler: [requireAuth, requireEngagementRole('write')] },
    async (req) => {
      const { slug, id } = req.params as { slug: string; id: string };
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const tag = await app.db.tag.findFirst({ where: { id: Number(id), engagementId: eng.id } });
      if (!tag) throw new HttpError(404, 'Tag not found');
      await app.db.tag.delete({ where: { id: tag.id } });
      return { ok: true };
    },
  );
}
