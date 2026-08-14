import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Runs in every test worker BEFORE any app code imports Prisma, so the client
// binds to the test database. Keep in sync with global-setup.ts.
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://reporter:reporter@localhost:5432/reporter_test';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret-1234567890';
process.env.BLOB_STORE = 'local';
process.env.BLOB_DIR = join(tmpdir(), 'reporter-test-blobs');
// Integration tests log in many times per run; don't let the login throttle trip.
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
// No auto-admin: tests create their own users.
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;
