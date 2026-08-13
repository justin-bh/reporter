<div align="center">

# reporter

**Evidence collection & reporting for security operations.**

Capture screenshots, terminal recordings, and notes during an engagement; organize them into operations, tag them, group them into findings, and report — all from a server you run yourself.

</div>

> A clean-room, all-TypeScript rebuild of the [ASHIRT](https://github.com/ashirt-ops) concept. Self-hosted: run the server on your own machine, capture with the desktop app and terminal recorder.

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

## Quickstart (server, on Ubuntu)

Requires Docker with the Compose plugin. No Node.js needed on the server.

```bash
git clone <this repo> reporter && cd reporter
cp .env.example .env      # set SESSION_SECRET, DB_PASSWORD, and ADMIN_EMAIL/ADMIN_PASSWORD
docker compose up -d      # builds the image, starts postgres + app; migrations run automatically
```

Open `http://<server-ip>:8080` and sign in with the admin credentials from `.env` (or complete the one-time **/setup** screen if you left them blank).

Then, in the web UI, open **Account → API keys**, generate a pair, and plug it into the clients:

- **Desktop app** — install from the [desktop build](apps/desktop/README.md), open Settings, and enter the server URL + keys.
- **Terminal recorder** — `npm install -g @reporter/term`, then run `reporter-term` and follow the setup prompts. See [apps/term](apps/term/README.md).

### Notes

- **TLS**: the default is plain HTTP for a trusted LAN. To serve HTTPS, put a reverse proxy in front — e.g. add a [Caddy](https://caddyserver.com) service that does `reverse_proxy app:8080` and set `APP_URL=https://…` so session cookies are marked `Secure`.
- **Backups**: the database (`pg_dump`) and the blob volume both hold state — see [apps/server/README.md](apps/server/README.md#backup--restore).
- **S3 storage**: set `BLOB_STORE=s3` + the `S3_*` vars to store evidence in a bucket instead of the local volume.

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
