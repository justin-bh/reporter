<div align="center">

# reporter

**Evidence collection & reporting for security operations.**

Capture screenshots, terminal recordings, and notes during an engagement; organize them into operations, tag them, group them into findings, and report — all from a server you run yourself.

</div>

> Status: **under construction.** A clean-room, all-TypeScript rebuild of the [ASHIRT](https://github.com/ashirt-ops) concept. See build progress in [`CLAUDE.md`](CLAUDE.md).

## What's in the box

| Component | What it does | Runs on |
|-----------|--------------|---------|
| **Server** (`apps/server`) | Central evidence store + web reporting UI. | Ubuntu (Docker) |
| **Desktop app** (`apps/desktop`) | Tray app: hotkey screenshots + code blocks, queued and submitted. | macOS · Windows · Linux |
| **Terminal recorder** (`apps/term`) | `reporter-term` records shell sessions and uploads them as evidence. | macOS · Windows · Linux |

```
┌────────────┐        ┌────────────┐         ┌──────────────────┐
│  Desktop   │        │   Web UI   │         │  reporter-term   │
│  (Electron)│        │  (browser) │         │  (terminal CLI)  │
└─────┬──────┘        └─────┬──────┘         └────────┬─────────┘
      │  HMAC API           │  session cookie          │  HMAC API
      └─────────────────────┴──────────────┬───────────┘
                                            ▼
                              ┌──────────────────────────┐
                              │   reporter server        │
                              │  Fastify · PostgreSQL     │
                              │  blobs: local FS or S3    │
                              └──────────────────────────┘
```

## Concepts

- **Operation** — an engagement that scopes everything. Users join with a role (admin/write/read).
- **Evidence** — a timestamped artifact: screenshot, terminal recording, HTTP request, code block, event, or note.
- **Finding** — a reportable grouping of evidence.
- **Tag** — a colored label on evidence, scoped to an operation.
- **API key** — an access-key/secret-key pair a client app uses to submit evidence.

## Quickstart (server, on Ubuntu) — _finalized in Phase 5_

```bash
git clone <this repo> reporter && cd reporter
cp .env.example .env      # set SESSION_SECRET, DB_PASSWORD, and the first-admin credentials
docker compose up -d      # postgres + app; migrations run automatically
# open http://<server-ip>:8080 and finish first-admin setup
```

Then, in the web UI, open **Account → API keys**, generate a pair, and plug it into the desktop app or `reporter-term`.

## Development

Requires Node 22+, pnpm 10+, Docker.

```bash
pnpm install
pnpm build          # build shared packages then apps
pnpm test           # run the test suites
pnpm dev:server     # API + web host on :8080
pnpm dev:web        # Vite dev server on :5173 (proxies to :8080)
```

Repo layout, conventions, and the HMAC protocol are documented in [`CLAUDE.md`](CLAUDE.md); the design system in [`DESIGN.md`](DESIGN.md). Per-component docs live in each `apps/*` and `packages/*` folder.

## License

[MIT](LICENSE) © 2026 Justin Montalbano
