# @reporter/server — component guide

Fastify 5 + Prisma 6 + PostgreSQL. Hosts the client API (`/api/*`, HMAC), the web API (`/web/*`, session cookie), and serves the built web SPA statically.

## Layout (target)

```
src/
  index.ts            boot: read config → buildApp → listen
  app.ts              buildApp(): registers plugins + routes, no side effects (tests use fastify.inject)
  config.ts           zod-parsed env, fail-fast
  plugins/            prisma, session-auth, hmac-auth, blob-store, static
  routes/web/*        auth, engagements, evidence, findings, tags, queries, admin, account
  routes/api/*        client-api (checkconnection, engagements, evidence, tags)
  services/*          evidence, findings, engagements, auth/{local,oidc,webauthn}
  blobstore/          types.ts (ContentStore), local.ts, s3.ts
  helpers/            timeline-query-to-sql.ts, pagination.ts, slug.ts
prisma/
  schema.prisma       source of truth for the data model
  seed.ts             dev/demo seed (admin, operator, tags, demo engagement + evidence)
```

## Rules

- Prisma schema first, then `prisma migrate dev --name <change>`. Raw SQL only via `Prisma.sql` (timeline filters).
- Reuse `@reporter/shared` zod schemas; register with `fastify-type-provider-zod`.
- HMAC verification imports `computeSignature`/`verifySignature` from `@reporter/api-client` — never reimplement.
- Capture the raw body buffer for `/api/*` before parsing (needed for the signature). Uniform 401s.
- Blobs never touch the DB — always the `ContentStore`.

## Gotchas

- HMAC raw-body buffering is memory-bound; capped by `MAX_UPLOAD_BYTES`.
- `buildApp()` must stay side-effect-free for tests.

## Verify

- `pnpm --filter @reporter/server test` (integration vs real Postgres, `TEST_DATABASE_URL`).
- `/run-stack` + `/verify-api` skills for a manual HMAC round-trip.
