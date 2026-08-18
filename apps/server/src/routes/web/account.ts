import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError, requireAuth } from '../../auth/guards.js';
import { hashPassword, verifyPassword } from '../../auth/password.js';
import { generateApiKey } from '../../services/apikeys.js';
import { serializeApiKey, serializeUser } from '../../services/serializers.js';

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.get('/account/api-keys', { preHandler: requireAuth }, async (req) => {
    const keys = await app.db.apiKey.findMany({
      where: { userId: req.authedUser!.id },
      orderBy: { createdAt: 'desc' },
    });
    return keys.map(serializeApiKey);
  });

  app.post('/account/api-keys', { preHandler: requireAuth }, async (req, reply) => {
    const key = await generateApiKey(app.db, req.authedUser!.id);
    reply.status(201);
    // secretKey is included exactly once, here.
    return { accessKey: key.accessKey, secretKey: key.secretKey };
  });

  app.delete('/account/api-keys/:accessKey', { preHandler: requireAuth }, async (req) => {
    const { accessKey } = req.params as { accessKey: string };
    const key = await app.db.apiKey.findUnique({ where: { accessKey } });
    if (!key || key.userId !== req.authedUser!.id) throw new HttpError(404, 'API key not found');
    await app.db.apiKey.delete({ where: { id: key.id } });
    return { ok: true };
  });

  app.put('/account/profile', { preHandler: requireAuth }, async (req) => {
    const body = z
      .object({ firstName: z.string().min(1).optional(), lastName: z.string().min(1).optional() })
      .parse(req.body);
    const user = await app.db.user.update({ where: { id: req.authedUser!.id }, data: body });
    return serializeUser(user);
  });

  app.post('/account/password', { preHandler: requireAuth }, async (req) => {
    const { currentPassword, newPassword } = z
      .object({ currentPassword: z.string().optional(), newPassword: z.string().min(8) })
      .parse(req.body);

    const identity = await app.db.authIdentity.findFirst({
      where: { userId: req.authedUser!.id, scheme: 'local' },
    });
    if (!identity) throw new HttpError(400, 'Current password is incorrect');
    // A pending reset (recovery-link sign-in) waives the current password once;
    // otherwise it is required and must verify.
    if (!identity.mustResetPassword) {
      const ok =
        identity.passwordHash &&
        currentPassword &&
        (await verifyPassword(identity.passwordHash, currentPassword));
      if (!ok) throw new HttpError(400, 'Current password is incorrect');
    }
    await app.db.authIdentity.update({
      where: { id: identity.id },
      data: { passwordHash: await hashPassword(newPassword), mustResetPassword: false },
    });
    return { ok: true };
  });
}
