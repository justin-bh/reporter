import type { FastifyReply, FastifyRequest } from 'fastify';
import { isDateWithinSkew, parseAuthorization, verifySignature } from '@reporter/api-client';
import { ROLE_RANK, type EngagementRole } from '@reporter/shared';
import type { User } from '@prisma/client';
import type { AuthedUser } from '../types.js';
import { SESSION_COOKIE, resolveSession } from './session.js';

function toAuthedUser(user: User, via: AuthedUser['via']): AuthedUser {
  return {
    id: user.id,
    slug: user.slug,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    admin: user.admin,
    via,
  };
}

/** A thrown error that carries an HTTP status; caught by the app error handler. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Web-plane auth: resolve the session cookie or 401. */
export async function requireAuth(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  const user = await resolveSession(req.server.db, token);
  if (!user) throw new HttpError(401, 'Not authenticated');
  req.authedUser = toAuthedUser(user, 'session');
}

/** Client-API-plane auth: verify the HMAC signature or a uniform 401. */
export async function requireApiAuth(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const fail = () => new HttpError(401, 'Unauthorized');

  const parsed = parseAuthorization(req.headers['authorization']);
  const date = req.headers['date'];
  if (!parsed || typeof date !== 'string' || !isDateWithinSkew(date)) throw fail();

  const apiKey = await req.server.db.apiKey.findUnique({
    where: { accessKey: parsed.accessKey },
    include: { user: true },
  });
  if (!apiKey || apiKey.user.disabled || apiKey.user.deletedAt) throw fail();

  // Path must include the query string exactly as signed.
  const ok = verifySignature(
    {
      method: req.method,
      path: req.url,
      date,
      body: req.rawBody ?? Buffer.alloc(0),
      secretKeyBase64: Buffer.from(apiKey.secretKey).toString('base64'),
    },
    parsed.signature,
  );
  if (!ok) throw fail();

  req.authedUser = toAuthedUser(apiKey.user, 'apikey');
  // Best-effort last-auth stamp; don't block the request on it.
  void req.server.db.apiKey
    .update({ where: { id: apiKey.id }, data: { lastAuth: new Date() } })
    .catch(() => {});
}

/** Requires the authenticated user to be a site admin. Run after an auth guard. */
export async function requireAdmin(req: FastifyRequest): Promise<void> {
  if (!req.authedUser?.admin) throw new HttpError(403, 'Admin only');
}

/**
 * Returns a preHandler that requires at least `minRole` on the engagement named
 * by `:slug`. Site admins bypass. Run after an auth guard.
 */
export function requireEngagementRole(minRole: EngagementRole) {
  return async (req: FastifyRequest): Promise<void> => {
    const user = req.authedUser;
    if (!user) throw new HttpError(401, 'Not authenticated');

    const slug = (req.params as { slug?: string }).slug;
    if (!slug) throw new HttpError(400, 'Missing engagement slug');

    const engagement = await req.server.db.engagement.findUnique({ where: { slug } });
    if (!engagement) throw new HttpError(404, 'Engagement not found');

    if (user.admin) return; // site admins can access every engagement

    const role = await req.server.db.userEngagementRole.findUnique({
      where: { userId_engagementId: { userId: user.id, engagementId: engagement.id } },
    });
    if (!role || ROLE_RANK[role.role] < ROLE_RANK[minRole]) {
      throw new HttpError(403, 'Insufficient role for this engagement');
    }
  };
}
