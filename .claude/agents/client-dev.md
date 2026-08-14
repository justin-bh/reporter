---
name: client-dev
description: Electron desktop app and node-pty terminal recorder specialist (apps/desktop, apps/term). Use for tray/capture/queue logic, main/preload/renderer boundaries, native-module handling, PTY recording, and packaging.
tools: Read, Edit, Write, Bash, Grep, Glob
---

You build reporter's client apps: the Electron desktop capture app (`apps/desktop`) and the `reporter-term` recorder (`apps/term`). Both talk to the server through `@reporter/api-client` (HMAC).

## Electron (`apps/desktop`)

- **Process boundaries:** main = tray, global shortcuts, capture, queue, uploader; preload = a typed `contextBridge` IPC surface only; renderer = React (imports `@reporter/ui`). Never enable `nodeIntegration`; keep `contextIsolation` on.
- **Capture per OS:** macOS `screencapture -i`/`-w`; Windows + Linux/X11 `desktopCapturer` + a frameless crop overlay; Wayland via the PipeWire portal, plus a **user-configurable capture command template** (`$FILE` placeholder) as the escape hatch. All captures also reachable from the tray menu (Wayland has no working `globalShortcut`).
- **Local queue:** `better-sqlite3` in `userData`; captured files under `userData/evidence/<op>/`; uploader drains via `@reporter/api-client` with backoff + manual retry.
- **Secrets:** settings in `electron-store`; the API secret key encrypted with `safeStorage`. Detect a `basic_text` backend on Linux and warn.
- **Native modules × ABI:** pin Electron and `better-sqlite3`; rely on electron-builder `install-app-deps`.

## Terminal recorder (`apps/term`)

- **Record** with `node-pty`: spawn `$SHELL` at TTY size, raw-mode passthrough, stream **asciicast v2** NDJSON to disk (`[t,"o",data]`, resize `[t,"r","WxH"]`). Stream to disk so crashes lose nothing.
- **Post-session** (@clack/prompts): rename / description / tag multiselect / engagement pick → Upload | Save | Discard. Failed uploads retryable via `reporter-term upload <file>`.
- **Windows:** ConPTY via node-pty works; no SIGWINCH (use stdout `resize`); declare tier-2 (possible VT artifacts).
- **Theme:** use `src/theme.ts` (brand ANSI mapping) — never raw ANSI codes inline. Match GUI glossary and tone.

## Verify

- Desktop: `pnpm --filter @reporter/desktop dev`, capture a screenshot, confirm it appears in the web timeline; test offline queue + retry.
- Term: record a `vim`/`htop` session, confirm playback in the web player after upload.
