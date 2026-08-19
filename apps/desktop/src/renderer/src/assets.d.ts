/**
 * Ambient types for Vite static asset imports in the renderer. Vite resolves an
 * image import (e.g. `import markUrl from './assets/reporter-mark.png'`) to the
 * served URL string. Kept as its own script-context declaration file so the
 * wildcard module is picked up globally.
 */
declare module '*.png' {
  const src: string;
  export default src;
}
