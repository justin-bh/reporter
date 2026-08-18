import { randomBytes, createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { defaultTagColorFor, type AdminEngagement, type AdminUser } from '@reporter/shared';
import { HttpError, requireAdmin, requireAuth } from '../../auth/guards.js';
import { createLocalUser } from '../../services/users.js';
import {
  serializeApiKey,
  serializeEngagement,
  serializeUser,
} from '../../services/serializers.js';

const adminGuard = [requireAuth, requireAdmin];

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // --- Users ---
  app.get('/admin/users', { preHandler: adminGuard }, async (): Promise<AdminUser[]> => {
    const users = await app.db.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      // Filter in the query — never materialize TOTP secrets for a list view.
      include: { identities: { where: { totpSecret: { not: null } }, select: { id: true } } },
    });
    return users.map((u) => ({
      ...serializeUser(u),
      hasTotp: u.identities.length > 0,
    }));
  });

  app.post('/admin/users', { preHandler: adminGuard }, async (req, reply) => {
    const body = z
      .object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8).optional(),
        admin: z.boolean().default(false),
        headless: z.boolean().default(false),
      })
      .parse(req.body);

    const exists = await app.db.user.findUnique({ where: { email: body.email } });
    if (exists) throw new HttpError(409, 'A user with that email already exists');

    const user = await createLocalUser(app.db, {
      ...body,
      mustResetPassword: Boolean(body.password),
    });
    reply.status(201);
    return serializeUser(user);
  });

  app.put('/admin/users/:slug', { preHandler: adminGuard }, async (req) => {
    const { slug } = req.params as { slug: string };
    const body = z
      .object({ admin: z.boolean().optional(), disabled: z.boolean().optional() })
      .parse(req.body);
    const user = await app.db.user.findUnique({ where: { slug } });
    if (!user) throw new HttpError(404, 'User not found');
    const updated = await app.db.user.update({ where: { id: user.id }, data: body });
    return serializeUser(updated);
  });

  app.delete('/admin/users/:slug', { preHandler: adminGuard }, async (req) => {
    const { slug } = req.params as { slug: string };
    const user = await app.db.user.findUnique({ where: { slug } });
    if (!user) throw new HttpError(404, 'User not found');
    if (user.id === req.authedUser!.id) throw new HttpError(400, 'You cannot delete yourself');
    // Soft delete + revoke sessions/keys.
    await app.db.$transaction([
      app.db.user.update({
        where: { id: user.id },
        data: { deletedAt: new Date(), disabled: true },
      }),
      app.db.session.deleteMany({ where: { userId: user.id } }),
      app.db.apiKey.deleteMany({ where: { userId: user.id } }),
    ]);
    return { ok: true };
  });

  // Generate a one-time recovery login link (admin-issued).
  app.post('/admin/users/:slug/recovery', { preHandler: adminGuard }, async (req) => {
    const { slug } = req.params as { slug: string };
    const user = await app.db.user.findUnique({ where: { slug } });
    if (!user) throw new HttpError(404, 'User not found');
    const code = randomBytes(24).toString('base64url');
    const codeHash = createHash('sha256').update(code).digest('hex');
    await app.db.recoveryCode.create({
      data: { userId: user.id, codeHash, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });
    // The code is returned once; the admin shares the /login/recovery/<code> link.
    return { recoveryUrl: `${app.config.APP_URL}/login/recovery/${code}` };
  });

  // Clear the user's TOTP secret(s) so they re-enroll on next login. A no-op
  // (nothing enrolled) still succeeds; `hadTotp` tells the caller which it was.
  app.post('/admin/users/:slug/totp-reset', { preHandler: adminGuard }, async (req) => {
    const { slug } = req.params as { slug: string };
    const user = await app.db.user.findUnique({ where: { slug } });
    if (!user) throw new HttpError(404, 'User not found');
    const { count } = await app.db.authIdentity.updateMany({
      where: { userId: user.id, totpSecret: { not: null } },
      data: { totpSecret: null },
    });
    return { ok: true, hadTotp: count > 0 };
  });

  // --- Per-user API keys (visibility + revocation) ---
  app.get('/admin/users/:slug/api-keys', { preHandler: adminGuard }, async (req) => {
    const { slug } = req.params as { slug: string };
    const user = await app.db.user.findUnique({ where: { slug } });
    if (!user) throw new HttpError(404, 'User not found');
    const keys = await app.db.apiKey.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    return keys.map(serializeApiKey);
  });

  app.delete(
    '/admin/users/:slug/api-keys/:accessKey',
    { preHandler: adminGuard },
    async (req) => {
      const { slug, accessKey } = req.params as { slug: string; accessKey: string };
      const user = await app.db.user.findUnique({ where: { slug } });
      if (!user) throw new HttpError(404, 'User not found');
      const key = await app.db.apiKey.findUnique({ where: { accessKey } });
      if (!key || key.userId !== user.id) throw new HttpError(404, 'API key not found');
      await app.db.apiKey.delete({ where: { id: key.id } });
      return { ok: true };
    },
  );

  // --- Engagements (site-wide view; per-engagement mutations reuse the
  // /engagements/:slug routes, which site admins already bypass into) ---
  app.get(
    '/admin/engagements',
    { preHandler: adminGuard },
    async (req): Promise<AdminEngagement[]> => {
      const engs = await app.db.engagement.findMany({
        include: {
          _count: { select: { evidence: true, roles: true, findings: true } },
          roles: { where: { userId: req.authedUser!.id }, select: { role: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return engs.map((eng) => ({
        ...serializeEngagement(eng, {
          numUsers: eng._count.roles,
          numEvidence: eng._count.evidence,
          numFindings: eng._count.findings,
        }),
        amMember: eng.roles.length > 0,
      }));
    },
  );

  // --- Default tags ---
  app.get('/admin/default-tags', { preHandler: adminGuard }, async () => {
    return app.db.defaultTag.findMany({ orderBy: { name: 'asc' } });
  });

  app.post('/admin/default-tags', { preHandler: adminGuard }, async (req, reply) => {
    const body = z
      .object({ name: z.string().min(1).max(64), colorName: z.string().optional() })
      .parse(req.body);
    const created = await app.db.defaultTag.create({
      data: { name: body.name, colorName: body.colorName ?? defaultTagColorFor(body.name) },
    });
    reply.status(201);
    return created;
  });

  app.delete('/admin/default-tags/:id', { preHandler: adminGuard }, async (req) => {
    const { id } = req.params as { id: string };
    await app.db.defaultTag.delete({ where: { id: Number(id) } }).catch(() => {});
    return { ok: true };
  });

  // --- Finding categories ---
  app.get('/admin/finding-categories', { preHandler: adminGuard }, async () => {
    return app.db.findingCategory.findMany({
      where: { deletedAt: null },
      orderBy: { category: 'asc' },
    });
  });

  app.post('/admin/finding-categories', { preHandler: adminGuard }, async (req, reply) => {
    const { category } = z.object({ category: z.string().min(1).max(255) }).parse(req.body);
    const created = await app.db.findingCategory.upsert({
      where: { category },
      create: { category },
      update: { deletedAt: null },
    });
    reply.status(201);
    return created;
  });

  app.delete('/admin/finding-categories/:id', { preHandler: adminGuard }, async (req) => {
    const { id } = req.params as { id: string };
    await app.db.findingCategory
      .update({ where: { id: Number(id) }, data: { deletedAt: new Date() } })
      .catch(() => {});
    return { ok: true };
  });
}
