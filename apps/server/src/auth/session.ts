import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export const SESSION_COOKIE = 'reporter_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Hash a raw cookie token into its stored session id (never store the token). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Create a session row and return the raw token to set as the cookie. */
export async function createSession(db: PrismaClient, userId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const id = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({ data: { id, userId, expiresAt } });
  return token;
}

/** Look up the user for a raw cookie token, or null if missing/expired. */
export async function resolveSession(db: PrismaClient, token: string | undefined) {
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (session.user.disabled || session.user.deletedAt) return null;
  return session.user;
}

/** Delete the session for a raw cookie token (logout). */
export async function destroySession(db: PrismaClient, token: string | undefined): Promise<void> {
  if (!token) return;
  await db.session.delete({ where: { id: hashToken(token) } }).catch(() => {});
}

export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;
