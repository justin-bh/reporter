# @reporter/web

The reporter web reporting UI — a React + Vite single-page app. It is built to static files and served by the server at `/`; there is no separate web deployment.

## Development

```bash
pnpm dev:server    # API host on :8080 (see the server README)
pnpm dev:web       # Vite dev server on :5173, proxying /web and /api to :8080
```

Open http://localhost:5173. For a production-like view, the server serves the built UI at http://localhost:8080.

## Build

```bash
pnpm --filter @reporter/web build     # → apps/web/dist (served by the server)
```

## Structure

- Built entirely from the shared design system, `@reporter/ui` (see [DESIGN.md](../../DESIGN.md)).
- Data via TanStack Query (`src/api/hooks.ts`); one fetch wrapper adds the CSRF header (`src/api/client.ts`).
- Auth/session context in `src/auth.tsx`; routing in `src/App.tsx`.
- Evidence renderers (image, code, terminal player, HAR, note) in `src/components/evidence/`.

More detail in [CLAUDE.md](CLAUDE.md).
