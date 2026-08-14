# @reporter/desktop — component guide

Electron tray app for screenshot / codeblock capture. electron-vite (main/preload/renderer) + electron-builder. Renderer imports `@reporter/ui` so it looks identical to the web app. Talks to the server via `@reporter/api-client` (HMAC).

## Process boundaries

- **main**: tray, global shortcuts, capture, `better-sqlite3` queue, uploader, settings/secrets.
- **preload**: a typed `contextBridge` IPC surface only. `contextIsolation` on, `nodeIntegration` off.
- **renderer**: React (History, pre-submit editor, Settings, About).

## Capture per OS

- macOS: `screencapture -i` (area) / `-w` (window).
- Windows + Linux/X11: `desktopCapturer` + frameless fullscreen crop overlay.
- Wayland: PipeWire portal picker; plus a user-configurable capture command template (`$FILE`).

## Queue & secrets

- **Queue** and **settings** are both JSON via `electron-store` (`reporter-queue`, `reporter-settings`) in `userData` — no native modules, so no ABI-rebuild step. Captured screenshots live in the OS temp dir; the queue holds their paths. Uploader (`uploader.ts`) drains pending/failed items via `@reporter/api-client`, with manual retry from History. (For very large queues, `better-sqlite3` is the documented upgrade.)
- Secret key encrypted via `safeStorage`; detects the weak Linux `basic_text` backend and surfaces a warning (`weakSecretStorage`).

## Architecture (as built)

- **main** (ESM, `out/main/index.js`): tray, global shortcuts, capture, queue, uploader, IPC. Bundled by electron-vite.
- **preload** (`out/preload/index.mjs`, `sandbox:false`): `contextBridge` exposes `window.reporter` (typed in `src/preload/index.ts` → `ReporterBridge`). IPC channel names live in `src/shared/channels.ts`.
- **renderer** (React + `@reporter/ui`): `HistoryView`, `SettingsView`, `ComposeView`, `AboutView`, switched by `App.tsx` on `onNavigate`/`onDraftReady` events.

## Version & About

- **Single source of truth** for the app version is `apps/desktop/package.json` `version` (what electron-builder stamps into installers). Bump it repo-wide with `pnpm run version:bump` — never hand-edit (see root `CLAUDE.md` → _Versioning & releases_).
- **Build metadata is injected** by `electron.vite.config.ts` `define` into the _main_ bundle only: `__APP_VERSION__`, `__APP_HOMEPAGE__`, `__GIT_COMMIT__`, `__BUILD_DATE__` (declared in `src/env.d.ts`, read via `src/main/build-info.ts`). CI can override `GIT_COMMIT` / `BUILD_DATE` env vars for reproducible builds.
- **About view** (`src/renderer/src/views/AboutView.tsx`): tray → _About reporter_ or window nav → **About**. Shows version, commit, build date, Electron/Chromium/Node/V8, platform, server URL. IPC: `about:get` → `AboutInfo`. `update:check` hits the GitHub _releases/latest_ API for the repo in `homepage` and compares SemVer (never throws; unset/unreachable feed degrades gracefully). Links open via `shell:open-external` (https-only). `app.setAboutPanelOptions` keeps the OS-native panel in sync.

## Gotchas (flag to users)

- Wayland: `globalShortcut` doesn't work → reachable from tray + `reporter-desktop --capture-area` second-instance trigger.
- Linux without keyring: `safeStorage` backend `basic_text` is weak → detected and warned.
- Image preview in compose uses a data URL from main (Electron `webSecurity` blocks `file://`).

## Verify

`pnpm --filter @reporter/desktop dev`; capture a screenshot → confirm it lands in the web timeline; test offline queue + retry; `ux-ui` review vs web.
