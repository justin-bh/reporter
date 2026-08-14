import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { savedQueryTypeSchema } from '@reporter/shared';
import { HttpError, requireAuth, requireEngagementRole } from '../../auth/guards.js';
import { serializeSavedQuery } from '../../services/serializers.js';

const createQuerySchema = z.object({
  name: z.string().min(1).max(255),
  query: z.string(),
  type: savedQueryTypeSchema,
});

export async function queryRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/engagements/:slug/queries',
    { preHandler: [requireAuth, requireEngagementRole('read')] },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const queries = await app.db.savedQuery.findMany({
        where: { engagementId: eng.id },
        orderBy: { name: 'asc' },
      });
      return queries.map(serializeSavedQuery);
    },
  );

  app.post(
    '/engagements/:slug/queries',
    { preHandler: [requireAuth, requireEngagementRole('write')] },
    async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const input = createQuerySchema.parse(req.body);
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const created = await app.db.savedQuery.create({
        data: { engagementId: eng.id, ...input },
      });
      reply.status(201);
      return serializeSavedQuery(created);
    },
  );

  app.put(
    '/engagements/:slug/queries/:id',
    { preHandler: [requireAuth, requireEngagementRole('write')] },
    async (req) => {
      const { slug, id } = req.params as { slug: string; id: string };
      const body = z
        .object({ name: z.string().min(1).optional(), query: z.string().optional() })
        .parse(req.body);
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const existing = await app.db.savedQuery.findFirst({
        where: { id: Number(id), engagementId: eng.id },
      });
      if (!existing) throw new HttpError(404, 'Saved query not found');
      const updated = await app.db.savedQuery.update({ where: { id: existing.id }, data: body });
      return serializeSavedQuery(updated);
    },
  );

  app.delete(
    '/engagements/:slug/queries/:id',
    { preHandler: [requireAuth, requireEngagementRole('write')] },
    async (req) => {
      const { slug, id } = req.params as { slug: string; id: string };
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const existing = await app.db.savedQuery.findFirst({
        where: { id: Number(id), engagementId: eng.id },
      });
      if (!existing) throw new HttpError(404, 'Saved query not found');
      await app.db.savedQuery.delete({ where: { id: existing.id } });
      return { ok: true };
    },
  );
}
