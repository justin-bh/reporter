import { z } from 'zod';

/**
 * All server configuration comes from the environment and is parsed once here,
 * fail-fast, at boot. Nothing else reads `process.env` directly.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default('0.0.0.0'),
  APP_URL: z.string().url().default('http://localhost:8080'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  SESSION_SECRET: z
    .string()
    .min(16, 'SESSION_SECRET must be at least 16 characters')
    .default('dev-insecure-session-secret-change-me'),

  // Max login attempts per client per minute (throttles credential stuffing).
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  // Blob storage
  BLOB_STORE: z.enum(['local', 's3']).default('local'),
  BLOB_DIR: z.string().default('./.data/blobs'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_PREFIX: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),

  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(100 * 1024 * 1024),

  // First-admin bootstrap (used only when the users table is empty)
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),

  // Optional integrations
  OIDC_ISSUER: z.string().url().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  WEBAUTHN_RP_ID: z.string().optional(),

  // Cookie security. Defaults to true only when APP_URL is https.
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export type ServerConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid server configuration:\n${issues}`);
  }
  const c = parsed.data;

  const cookieSecure = c.COOKIE_SECURE ?? c.APP_URL.startsWith('https://');

  return {
    ...c,
    cookieSecure,
    isProd: c.NODE_ENV === 'production',
    oidcEnabled: Boolean(c.OIDC_ISSUER && c.OIDC_CLIENT_ID && c.OIDC_CLIENT_SECRET),
    webauthnEnabled: Boolean(c.WEBAUTHN_RP_ID),
  };
}
