# @reporter/desktop — component guide

Electron tray app for screenshot / codeblock capture. electron-vite (main/preload/renderer) + electron-builder. Renderer imports `@reporter/ui` so it looks identical to the web app. Talks to the server via `@reporter/api-client` (HMAC).

## Process boundaries

- **main**: tray, global shortcuts, capture, `better-sqlite3` queue, uploader, settings/secrets.
- **preload**: a typed `contextBridge` IPC surface only. `contextIsolation` on, `nodeIntegration` off.
- **renderer**: React (History, pre-submit editor, Settings).

## Capture per OS

- macOS: `screencapture -i` (area) / `-w` (window).
- Windows + Linux/X11: `desktopCapturer` + frameless fullscreen crop overlay.
- Wayland: PipeWire portal picker; plus a user-configurable capture command template (`$FILE`).

## Queue & secrets

- `local_evidence` table in `userData`; files under `userData/evidence/<op>/`; uploader with backoff + manual retry.
- Settings in `electron-store`; secret key via `safeStorage`.

## Gotchas (flag to users)

- Wayland: `globalShortcut` doesn't work → reachable from tray + `reporter-desktop --capture-area` second-instance trigger.
- Linux without keyring: `safeStorage` backend `basic_text` is weak → detect and warn.
- Pin Electron + `better-sqlite3` together (native ABI); `electron-builder install-app-deps`.

## Verify

`pnpm --filter @reporter/desktop dev`; capture a screenshot → confirm it lands in the web timeline; test offline queue + retry; `ux-ui` review vs web.
