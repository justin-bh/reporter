import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { savedQueryTypeSchema } from '@reporter/shared';
import { HttpError, requireAuth, requireOperationRole } from '../../auth/guards.js';
import { serializeSavedQuery } from '../../services/serializers.js';

const createQuerySchema = z.object({
  name: z.string().min(1).max(255),
  query: z.string(),
  type: savedQueryTypeSchema,
});

export async function queryRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/operations/:slug/queries',
    { preHandler: [requireAuth, requireOperationRole('read')] },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const op = await app.db.operation.findUniqueOrThrow({ where: { slug } });
      const queries = await app.db.savedQuery.findMany({
        where: { operationId: op.id },
        orderBy: { name: 'asc' },
      });
      return queries.map(serializeSavedQuery);
    },
  );

  app.post(
    '/operations/:slug/queries',
    { preHandler: [requireAuth, requireOperationRole('write')] },
    async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const input = createQuerySchema.parse(req.body);
      const op = await app.db.operation.findUniqueOrThrow({ where: { slug } });
      const created = await app.db.savedQuery.create({
        data: { operationId: op.id, ...input },
      });
      reply.status(201);
      return serializeSavedQuery(created);
    },
  );

  app.put(
    '/operations/:slug/queries/:id',
    { preHandler: [requireAuth, requireOperationRole('write')] },
    async (req) => {
      const { slug, id } = req.params as { slug: string; id: string };
      const body = z
        .object({ name: z.string().min(1).optional(), query: z.string().optional() })
        .parse(req.body);
      const op = await app.db.operation.findUniqueOrThrow({ where: { slug } });
      const existing = await app.db.savedQuery.findFirst({
        where: { id: Number(id), operationId: op.id },
      });
      if (!existing) throw new HttpError(404, 'Saved query not found');
      const updated = await app.db.savedQuery.update({ where: { id: existing.id }, data: body });
      return serializeSavedQuery(updated);
    },
  );

  app.delete(
    '/operations/:slug/queries/:id',
    { preHandler: [requireAuth, requireOperationRole('write')] },
    async (req) => {
      const { slug, id } = req.params as { slug: string; id: string };
      const op = await app.db.operation.findUniqueOrThrow({ where: { slug } });
      const existing = await app.db.savedQuery.findFirst({
        where: { id: Number(id), operationId: op.id },
      });
      if (!existing) throw new HttpError(404, 'Saved query not found');
      await app.db.savedQuery.delete({ where: { id: existing.id } });
      return { ok: true };
    },
  );
}
