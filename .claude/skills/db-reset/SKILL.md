---
name: db-reset
description: Reset the reporter development database — drop, re-apply Prisma migrations, and seed sample engagements, users, tags, and evidence. Use when the local DB is dirty or you want fresh demo data.
---

# db-reset

Return the dev database to a clean, seeded state.

## Steps

1. Ensure Postgres is up (see `/run-stack`).
2. Reset schema + re-run all migrations (drops all data):
   ```bash
   pnpm --filter @reporter/server exec prisma migrate reset --force
   ```
   `migrate reset` runs the seed script automatically if configured in `apps/server/package.json` (`prisma.seed`). If not, run it explicitly:
   ```bash
   pnpm --filter @reporter/server run seed
   ```

## What the seed creates (`apps/server/prisma/seed.ts`)

- An **admin** user (`admin@reporter.local`, password `reporter-dev`, must-reset off for dev).
- A non-admin **operator** user with write role on the demo engagement.
- Default **tags** and **finding categories**.
- A demo **Engagement** ("Acme Assessment") with a handful of **Evidence** items across types (image, codeblock, note, and a sample terminal-recording `.cast`) so the timeline and renderers have content.
- An **API key** pair for the operator, printed to stdout for use with `/verify-api` and the client apps.

Report the printed API key pair and the admin login after seeding.
