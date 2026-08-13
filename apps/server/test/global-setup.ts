import { execSync } from 'node:child_process';

/**
 * Ensures the test database exists and is migrated, once per run. Creates it via
 * the dev Postgres container (reporter-dev-db) if needed, then applies
 * migrations. Override the target with TEST_DATABASE_URL.
 */
export default function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgresql://reporter:reporter@localhost:5432/reporter_test';
  const dbName = url.split('/').pop()!.split('?')[0]!;
  const container = process.env.TEST_DB_CONTAINER ?? 'reporter-dev-db';

  // Create the database if it doesn't exist (ignore "already exists").
  try {
    execSync(
      `docker exec ${container} psql -U reporter -d postgres -c "CREATE DATABASE ${dbName}"`,
      { stdio: 'ignore' },
    );
  } catch {
    // already exists, or container not present — migrate will surface real problems
  }

  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}
