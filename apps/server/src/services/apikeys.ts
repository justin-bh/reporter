import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export interface GeneratedApiKey {
  accessKey: string;
  /** Base64-encoded secret, shown to the user exactly once. */
  secretKey: string;
}

/** Generate and persist a new API key pair for a user. */
export async function generateApiKey(
  db: PrismaClient,
  userId: number,
): Promise<GeneratedApiKey> {
  const accessKey = randomBytes(18).toString('base64url');
  const secret = randomBytes(64);
  await db.apiKey.create({ data: { userId, accessKey, secretKey: secret } });
  return { accessKey, secretKey: secret.toString('base64') };
}
