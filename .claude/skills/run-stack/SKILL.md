---
name: run-stack
description: Start the reporter dev stack — PostgreSQL (Docker) plus the server and web dev servers — and health-check them. Use when you need the app running locally to test or view it.
---

# run-stack

Bring up the local development stack for reporter.

## Steps

1. **Database.** Start a dev Postgres if not already up:

   ```bash
   docker compose -f docker-compose.dev.yml up -d db
   ```

   If `docker-compose.dev.yml` doesn't exist yet (early phases), run a throwaway container:

   ```bash
   docker run -d --name reporter-dev-db -e POSTGRES_DB=reporter -e POSTGRES_USER=reporter -e POSTGRES_PASSWORD=reporter -p 5432:5432 postgres:17-alpine
   ```

   Wait until `docker exec reporter-dev-db pg_isready -U reporter` succeeds.

2. **Migrate + seed** (if schema exists): run the `/db-reset` skill, or:

   ```bash
   pnpm --filter @reporter/server exec prisma migrate deploy
   pnpm --filter @reporter/server run seed
   ```

3. **Server.** Prefer the `server` launch config (browser preview on :8080) via `preview_start`. Otherwise:

   ```bash
   pnpm dev:server
   ```

   Health check: `curl -fsS http://localhost:8080/web/flags` returns JSON.

4. **Web (optional, for hot-reload UI work).** Start the `web` launch config (:5173), which proxies `/web` and `/api` to :8080. For a production-like view, the server already serves the built web app at :8080.

## Teardown

```bash
docker rm -f reporter-dev-db 2>/dev/null || docker compose -f docker-compose.dev.yml down
```

Report the URLs that are live and the health-check results.
