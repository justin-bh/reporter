---
name: verify-api
description: Smoke-test the reporter client HMAC API end-to-end — generate/obtain an API key pair and run scripted @reporter/api-client calls (check connection, list engagements, create evidence) against the running server, asserting the results. Use to prove the client API works.
---

# verify-api

Prove the HMAC-signed client API works end-to-end, the way the desktop app and `reporter-term` use it.

## Prerequisites

- Server running (`/run-stack`) and DB seeded (`/db-reset`), which prints an API key pair.
- Or generate a fresh pair via the web UI (Account → API keys) once Phase 2 exists.

## Run

```bash
REPORTER_URL=http://localhost:8080 \
REPORTER_ACCESS_KEY=<access> \
REPORTER_SECRET_KEY=<secret> \
node scripts/verify-api.mjs
```

`scripts/verify-api.mjs` imports the built `@reporter/api-client` and:

1. `checkConnection()` → expects `{ ok: true }` and prints the authenticated user.
2. `listEngagements()` → expects the seeded demo engagement to be present.
3. `createEvidence(op, { contentType: 'image', description: 'verify-api smoke test', occurredAt }, pngBuffer)` using a tiny generated PNG → expects a new evidence UUID back.
4. Re-lists evidence (or fetches by UUID) → asserts the item exists with the right description and a thumbnail.

Exit non-zero on any failed assertion.

## Report

State PASS/FAIL per step and the created evidence UUID. On failure, include the HTTP status and response body — a 401 usually means clock skew or a signing mismatch (compare `packages/api-client/src/sign.ts` with `apps/server/src/plugins/hmac-auth.ts`).
