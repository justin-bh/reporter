import type { PrismaClient, User } from '@prisma/client';
import { hashPassword } from '../auth/password.js';
import { slugify, uniqueSlug } from '../helpers/slug.js';

export interface CreateLocalUserArgs {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  admin?: boolean;
  headless?: boolean;
  mustResetPassword?: boolean;
}

/**
 * Create a user with a `local` auth identity. Headless users (no password) are
 * used for automated API-only clients. The email is the local identifier.
 */
export async function createLocalUser(db: PrismaClient, args: CreateLocalUserArgs): Promise<User> {
  const slug = await uniqueSlug(
    slugify(`${args.firstName} ${args.lastName}`) || args.email.split('@')[0]!,
    async (s) => (await db.user.count({ where: { slug: s } })) > 0,
  );

  const passwordHash = args.password ? await hashPassword(args.password) : null;

  return db.user.create({
    data: {
      slug,
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      admin: args.admin ?? false,
      headless: args.headless ?? false,
      identities: {
        create: {
          scheme: 'local',
          identifier: args.email,
          passwordHash,
          mustResetPassword: args.mustResetPassword ?? false,
        },
      },
    },
  });
}
