import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createTagInput } from '@reporter/shared';
import { HttpError, requireAuth, requireOperationRole } from '../../auth/guards.js';
import { serializeTag } from '../../services/serializers.js';

export async function tagRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/operations/:slug/tags',
    { preHandler: [requireAuth, requireOperationRole('read')] },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const op = await app.db.operation.findUniqueOrThrow({ where: { slug } });
      const tags = await app.db.tag.findMany({
        where: { operationId: op.id },
        orderBy: { name: 'asc' },
      });
      return tags.map(serializeTag);
    },
  );

  app.post(
    '/operations/:slug/tags',
    { preHandler: [requireAuth, requireOperationRole('write')] },
    async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const input = createTagInput.parse(req.body);
      const op = await app.db.operation.findUniqueOrThrow({ where: { slug } });
      const existing = await app.db.tag.findUnique({
        where: { operationId_name: { operationId: op.id, name: input.name } },
      });
      if (existing) throw new HttpError(409, 'A tag with that name already exists');
      const tag = await app.db.tag.create({
        data: { operationId: op.id, name: input.name, colorName: input.colorName },
      });
      reply.status(201);
      return serializeTag(tag);
    },
  );

  app.put(
    '/operations/:slug/tags/:id',
    { preHandler: [requireAuth, requireOperationRole('write')] },
    async (req) => {
      const { slug, id } = req.params as { slug: string; id: string };
      const body = z
        .object({ name: z.string().min(1).max(64).optional(), colorName: z.string().optional() })
        .parse(req.body);
      const op = await app.db.operation.findUniqueOrThrow({ where: { slug } });
      const tag = await app.db.tag.findFirst({ where: { id: Number(id), operationId: op.id } });
      if (!tag) throw new HttpError(404, 'Tag not found');
      const updated = await app.db.tag.update({ where: { id: tag.id }, data: body });
      return serializeTag(updated);
    },
  );

  app.delete(
    '/operations/:slug/tags/:id',
    { preHandler: [requireAuth, requireOperationRole('write')] },
    async (req) => {
      const { slug, id } = req.params as { slug: string; id: string };
      const op = await app.db.operation.findUniqueOrThrow({ where: { slug } });
      const tag = await app.db.tag.findFirst({ where: { id: Number(id), operationId: op.id } });
      if (!tag) throw new HttpError(404, 'Tag not found');
      await app.db.tag.delete({ where: { id: tag.id } });
      return { ok: true };
    },
  );
}
