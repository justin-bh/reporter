/**
 * Build-time metadata for the running app, injected by electron.vite.config.ts.
 * `version` is the single source of truth for the app version — the same
 * `apps/desktop/package.json` field electron-builder stamps into installers.
 */
export const BUILD_INFO = {
  version: __APP_VERSION__,
  homepage: __APP_HOMEPAGE__,
  commit: __GIT_COMMIT__,
  buildDate: __BUILD_DATE__,
} as const;
