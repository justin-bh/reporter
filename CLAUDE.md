# reporter — project guide for Claude

**reporter** is an evidence-collection and reporting toolkit for security operations (red team, pentest, ops). It is a clean-room rebuild of the ASHIRT concept in an all-TypeScript stack. Three surfaces share one server and one design system:

1. **Server** (`apps/server`) — Fastify + PostgreSQL + Prisma. Central evidence store + web reporting UI. Deploys via Docker Compose on a local Ubuntu box.
2. **Desktop app** (`apps/desktop`) — Electron tray app for screenshot / codeblock capture. macOS/Windows/Linux.
3. **Terminal recorder** (`apps/term`) — Node CLI (`reporter-term`) that records shell sessions as asciicast and uploads them as evidence.

## Monorepo map (pnpm workspaces)

| Path | Package | Purpose |
|------|---------|---------|
| `packages/shared` | `@reporter/shared` | zod schemas, enums, timeline query parser, tag color palette. Browser + Node. |
| `packages/api-client` | `@reporter/api-client` | HMAC request signing + typed `ReporterClient`. Node-only. Used by desktop + term. |
| `packages/ui` | `@reporter/ui` | Design system: CSS-variable tokens, Tailwind preset, shared React primitives. |
| `apps/server` | `@reporter/server` | Fastify API + web UI host. Prisma schema is the source of truth for data. |
| `apps/web` | `@reporter/web` | React 19 + Vite SPA. Built output is served statically by the server. |
| `apps/desktop` | `@reporter/desktop` | Electron (electron-vite + electron-builder). Renderer imports `@reporter/ui`. |
| `apps/term` | `@reporter/term` | node-pty recorder CLI. Distributed via npm. |

## Conventions

- **Validation is zod-first.** Every API payload has a zod schema in `@reporter/shared`; types are `z.infer`red, never hand-written. Server routes validate with `fastify-type-provider-zod`.
- **Never hand-duplicate types** that exist in `@reporter/shared`. Import them.
- **HMAC signing lives in exactly one place**: `packages/api-client/src/sign.ts`. The server verifies with the same algorithm in `apps/server/src/plugins/hmac-auth.ts`. Do not reimplement it anywhere else.
- **UI uses `@reporter/ui` primitives and tokens** — no hard-coded colors/spacing, no per-app component forks. See `DESIGN.md` and the `ux-ui` agent.
- **Terminology is fixed** (see glossary in `DESIGN.md`): Operation, Evidence, Finding, Tag. Same words in web, desktop, and CLI.
- ESM everywhere (`"type": "module"`). TS strict, `noUncheckedIndexedAccess` on.

## HMAC auth protocol (client API, `/api/*`)

```
stringToSign = METHOD + "\n" + pathWithQuery + "\n" + dateRFC1123GMT + "\n" + sha256(rawBody)
Authorization: <accessKey>:<base64(HMAC-SHA256(secretKey, stringToSign))>
Date: <same RFC 1123 GMT value>
```
Web UI uses session cookies instead (`/web/*`), not HMAC.

## Common commands

```bash
pnpm install              # install all workspaces
pnpm build                # build packages then apps (topological)
pnpm test                 # vitest run across the workspace
pnpm lint                 # eslint
pnpm dev:server           # run the API + web host (port 8080)
pnpm dev:web              # run the Vite dev server (port 5173, proxies to 8080)
```

Project skills automate the rest: `/run-stack`, `/db-reset`, `/verify-api`, `/release`.

## Build status

- [x] Phase 0 — Foundation & scaffolding
- [x] Phase 1 — Server core
- [ ] Phase 2 — Web UI
- [ ] Phase 3 — Desktop app
- [ ] Phase 4 — Terminal recorder
- [ ] Phase 5 — Packaging, deploy & docs

Full plan: `/Users/justin/.claude/plans/can-you-rebuild-me-humming-taco.md`.
