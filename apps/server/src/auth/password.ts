import { hash, verify } from '@node-rs/argon2';

// argon2id with sensible interactive parameters.
const OPTIONS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(encoded: string, plain: string): Promise<boolean> {
  try {
    return await verify(encoded, plain, OPTIONS);
  } catch {
    return false;
  }
}
