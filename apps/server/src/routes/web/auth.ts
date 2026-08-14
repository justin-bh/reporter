import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { verifyPassword } from '../../auth/password.js';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSession,
  destroySession,
} from '../../auth/session.js';
import { HttpError, requireAuth } from '../../auth/guards.js';
import { createLocalUser } from '../../services/users.js';
import { serializeUser } from '../../services/serializers.js';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const setupSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

function setSessionCookie(app: FastifyInstance, reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: app.config.cookieSecure,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Public: what the SPA needs to render login/setup.
  app.get('/flags', async () => {
    const userCount = await app.db.user.count();
    return {
      appName: 'reporter',
      needsSetup: userCount === 0,
      oidcEnabled: app.config.oidcEnabled,
      webauthnEnabled: app.config.webauthnEnabled,
    };
  });

  // One-time first-admin creation; only works while there are zero users.
  app.post('/setup', async (req, reply) => {
    const body = setupSchema.parse(req.body);
    const userCount = await app.db.user.count();
    if (userCount > 0) throw new HttpError(409, 'Setup has already been completed');

    const user = await createLocalUser(app.db, { ...body, admin: true });
    const token = await createSession(app.db, user.id);
    setSessionCookie(app, reply, token);
    return { user: serializeUser(user) };
  });

  app.post(
    '/login',
    { config: { rateLimit: { max: app.config.LOGIN_RATE_LIMIT_MAX, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { email, password } = loginSchema.parse(req.body);
      const identity = await app.db.authIdentity.findFirst({
        where: { scheme: 'local', identifier: email },
        include: { user: true },
      });

      const ok = identity?.passwordHash && (await verifyPassword(identity.passwordHash, password));
      if (!identity || !ok || identity.user.disabled || identity.user.deletedAt) {
        throw new HttpError(401, 'Invalid email or password');
      }

      await app.db.authIdentity.update({
        where: { id: identity.id },
        data: { lastLogin: new Date() },
      });
      const token = await createSession(app.db, identity.user.id);
      setSessionCookie(app, reply, token);
      return { user: serializeUser(identity.user) };
    },
  );

  app.post('/logout', async (req, reply) => {
    await destroySession(app.db, req.cookies?.[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/me', { preHandler: requireAuth }, async (req) => {
    const user = await app.db.user.findUniqueOrThrow({ where: { id: req.authedUser!.id } });
    return { user: serializeUser(user) };
  });
}
