/**
 * Build-time constants injected by electron.vite.config.ts (`define`).
 * These are replaced literally in the **main** process bundle only; do not
 * reference them from preload/renderer code. Read them via `main/build-info.ts`.
 */
declare const __APP_VERSION__: string;
declare const __APP_HOMEPAGE__: string;
declare const __GIT_COMMIT__: string;
declare const __BUILD_DATE__: string;
