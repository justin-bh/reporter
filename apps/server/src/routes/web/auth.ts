import { createHash } from 'node:crypto';
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

  // Redeem an admin-issued one-time recovery link (see POST /admin/users/:slug/recovery).
  // Rate-limited like /login; the code is single-use and 24h-expiring.
  app.post(
    '/login/recovery',
    { config: { rateLimit: { max: app.config.LOGIN_RATE_LIMIT_MAX, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { code } = z.object({ code: z.string().min(1) }).parse(req.body);
      const codeHash = createHash('sha256').update(code).digest('hex');
      const recovery = await app.db.recoveryCode.findUnique({
        where: { codeHash },
        include: { user: true },
      });
      const valid =
        recovery &&
        !recovery.usedAt &&
        recovery.expiresAt > new Date() &&
        !recovery.user.disabled &&
        !recovery.user.deletedAt;
      if (!valid) throw new HttpError(401, 'This recovery link is invalid or has expired');

      // Atomic single-use claim: concurrent redemptions race on usedAt, and
      // exactly one wins. Losers get the same 401 as an invalid code.
      const claimed = await app.db.recoveryCode.updateMany({
        where: { id: recovery.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new HttpError(401, 'This recovery link is invalid or has expired');
      }

      // Recovery implies the old credentials may be compromised: burn any
      // other outstanding codes and revoke every existing session so only
      // the recovery session can use the current-password waiver below.
      await app.db.recoveryCode.updateMany({
        where: { userId: recovery.user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await app.db.session.deleteMany({ where: { userId: recovery.user.id } });

      // The user signed in without their password, so require them to set a
      // new one (the account password route waives "current password" once).
      await app.db.authIdentity.updateMany({
        where: { userId: recovery.user.id, scheme: 'local' },
        data: { mustResetPassword: true, lastLogin: new Date() },
      });

      const token = await createSession(app.db, recovery.user.id);
      setSessionCookie(app, reply, token);
      return { user: serializeUser(recovery.user) };
    },
  );

  app.post('/logout', async (req, reply) => {
    await destroySession(app.db, req.cookies?.[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/me', { preHandler: requireAuth }, async (req) => {
    const user = await app.db.user.findUniqueOrThrow({ where: { id: req.authedUser!.id } });
    const identity = await app.db.authIdentity.findFirst({
      where: { userId: user.id, scheme: 'local' },
      select: { mustResetPassword: true },
    });
    return {
      user: serializeUser(user, { mustResetPassword: identity?.mustResetPassword ?? false }),
    };
  });
}
