import type { FastifyInstance } from 'fastify';
import { createLocalUser } from './users.js';

/**
 * Create the first admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` when the users
 * table is empty (headless/Docker deploys). If those env vars are absent, the
 * SPA `/setup` flow creates the first admin instead.
 */
export async function bootstrapAdmin(app: FastifyInstance): Promise<void> {
  const count = await app.db.user.count();
  if (count > 0) return;

  const { ADMIN_EMAIL, ADMIN_PASSWORD } = app.config;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    app.log.warn(
      'No users and no ADMIN_EMAIL/ADMIN_PASSWORD set — visit /setup to create the first admin.',
    );
    return;
  }

  await createLocalUser(app.db, {
    firstName: 'Admin',
    lastName: 'User',
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    admin: true,
  });
  app.log.info(`Bootstrapped first admin: ${ADMIN_EMAIL}`);
}
