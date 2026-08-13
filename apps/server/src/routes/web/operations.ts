import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createOperationInput, operationStatusSchema } from '@reporter/shared';
import { HttpError, requireAuth, requireOperationRole } from '../../auth/guards.js';
import { serializeOperation, serializeUser } from '../../services/serializers.js';

export async function operationRoutes(app: FastifyInstance): Promise<void> {
  // List operations visible to the current user (admins see all).
  app.get('/operations', { preHandler: requireAuth }, async (req) => {
    const user = req.authedUser!;
    const ops = await app.db.operation.findMany({
      where: user.admin ? {} : { roles: { some: { userId: user.id } } },
      include: {
        _count: { select: { evidence: true, roles: true } },
        roles: { where: { userId: user.id }, select: { role: true } },
        prefs: { where: { userId: user.id }, select: { isFavorite: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return ops.map((op) =>
      serializeOperation(op, {
        role: op.roles[0]?.role,
        favorite: op.prefs[0]?.isFavorite ?? false,
        numUsers: op._count.roles,
        numEvidence: op._count.evidence,
      }),
    );
  });

  // Create an operation; the creator becomes its admin and default tags are copied in.
  app.post('/operations', { preHandler: requireAuth }, async (req) => {
    const input = createOperationInput.parse(req.body);
    const user = req.authedUser!;

    const existing = await app.db.operation.findUnique({ where: { slug: input.slug } });
    if (existing) throw new HttpError(409, 'An operation with that slug already exists');

    const defaultTags = await app.db.defaultTag.findMany();

    const op = await app.db.operation.create({
      data: {
        slug: input.slug,
        name: input.name,
        roles: { create: { userId: user.id, role: 'admin' } },
        tags: { create: defaultTags.map((t) => ({ name: t.name, colorName: t.colorName })) },
      },
    });
    return serializeOperation(op, { role: 'admin', favorite: false, numUsers: 1, numEvidence: 0 });
  });

  app.get(
    '/operations/:slug',
    { preHandler: [requireAuth, requireOperationRole('read')] },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const op = await app.db.operation.findUniqueOrThrow({
        where: { slug },
        include: {
          _count: { select: { evidence: true, roles: true } },
          roles: { where: { userId: req.authedUser!.id }, select: { role: true } },
          prefs: { where: { userId: req.authedUser!.id }, select: { isFavorite: true } },
        },
      });
      return serializeOperation(op, {
        role: req.authedUser!.admin ? 'admin' : op.roles[0]?.role,
        favorite: op.prefs[0]?.isFavorite ?? false,
        numUsers: op._count.roles,
        numEvidence: op._count.evidence,
      });
    },
  );

  app.put(
    '/operations/:slug',
    { preHandler: [requireAuth, requireOperationRole('admin')] },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const body = z
        .object({ name: z.string().min(1).max(255).optional(), status: operationStatusSchema.optional() })
        .parse(req.body);
      const op = await app.db.operation.update({ where: { slug }, data: body });
      return serializeOperation(op);
    },
  );

  // Toggle favorite for the current user.
  app.post(
    '/operations/:slug/favorite',
    { preHandler: [requireAuth, requireOperationRole('read')] },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const { favorite } = z.object({ favorite: z.boolean() }).parse(req.body);
      const op = await app.db.operation.findUniqueOrThrow({ where: { slug } });
      await app.db.userOperationPref.upsert({
        where: { userId_operationId: { userId: req.authedUser!.id, operationId: op.id } },
        create: { userId: req.authedUser!.id, operationId: op.id, isFavorite: favorite },
        update: { isFavorite: favorite },
      });
      return { favorite };
    },
  );

  // --- Operation membership management (operation admins) ---

  app.get(
    '/operations/:slug/users',
    { preHandler: [requireAuth, requireOperationRole('admin')] },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const op = await app.db.operation.findUniqueOrThrow({ where: { slug } });
      const roles = await app.db.userOperationRole.findMany({
        where: { operationId: op.id },
        include: { user: true },
      });
      return roles.map((r) => ({ user: serializeUser(r.user), role: r.role }));
    },
  );

  app.post(
    '/operations/:slug/users',
    { preHandler: [requireAuth, requireOperationRole('admin')] },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const body = z
        .object({ userSlug: z.string(), role: z.enum(['admin', 'write', 'read']) })
        .parse(req.body);
      const op = await app.db.operation.findUniqueOrThrow({ where: { slug } });
      const target = await app.db.user.findUnique({ where: { slug: body.userSlug } });
      if (!target) throw new HttpError(404, 'User not found');
      await app.db.userOperationRole.upsert({
        where: { userId_operationId: { userId: target.id, operationId: op.id } },
        create: { userId: target.id, operationId: op.id, role: body.role },
        update: { role: body.role },
      });
      return { user: serializeUser(target), role: body.role };
    },
  );

  app.delete(
    '/operations/:slug/users/:userSlug',
    { preHandler: [requireAuth, requireOperationRole('admin')] },
    async (req) => {
      const { slug, userSlug } = req.params as { slug: string; userSlug: string };
      const op = await app.db.operation.findUniqueOrThrow({ where: { slug } });
      const target = await app.db.user.findUnique({ where: { slug: userSlug } });
      if (!target) throw new HttpError(404, 'User not found');
      await app.db.userOperationRole
        .delete({ where: { userId_operationId: { userId: target.id, operationId: op.id } } })
        .catch(() => {});
      return { ok: true };
    },
  );
}
