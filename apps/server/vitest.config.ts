import { defineConfig } from 'vitest/config';

// Server integration tests run against a real Postgres (a dedicated test DB),
// serialized in a single fork so they can truncate between cases.
export default defineConfig({
  test: {
    include: ['test/**/*.itest.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup-env.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
