import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireEngagementRole } from '../../auth/guards.js';

export async function categoryRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/engagements/:slug/finding-categories',
    { preHandler: [requireAuth, requireEngagementRole('read')] },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const cats = await app.db.findingCategory.findMany({
        where: { engagementId: eng.id, deletedAt: null },
        orderBy: { category: 'asc' },
      });
      return cats.map((c) => ({ id: c.id, category: c.category }));
    },
  );

  app.post(
    '/engagements/:slug/finding-categories',
    { preHandler: [requireAuth, requireEngagementRole('write')] },
    async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const { category } = z.object({ category: z.string().min(1).max(255) }).parse(req.body);
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      // Upsert by (engagement, name), reviving a soft-deleted category if present.
      const cat = await app.db.findingCategory.upsert({
        where: { engagementId_category: { engagementId: eng.id, category } },
        create: { engagementId: eng.id, category },
        update: { deletedAt: null },
      });
      reply.status(201);
      return { id: cat.id, category: cat.category };
    },
  );

  app.delete(
    '/engagements/:slug/finding-categories/:id',
    { preHandler: [requireAuth, requireEngagementRole('admin')] },
    async (req) => {
      const { slug, id } = req.params as { slug: string; id: string };
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      // Soft-delete, scoped to this engagement so an id from another engagement
      // can't be targeted. Findings keep their label.
      await app.db.findingCategory
        .updateMany({
          where: { id: Number(id), engagementId: eng.id },
          data: { deletedAt: new Date() },
        })
        .catch(() => {});
      return { ok: true };
    },
  );
}
