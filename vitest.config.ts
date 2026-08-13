import { defineConfig } from 'vitest/config';

// Root test runner. Discovers *.test.ts across packages and apps. Vite's
// resolver maps `.js` import specifiers to their `.ts` sources, so the same
// extensionful imports work at build time (tsc) and test time (vitest).
export default defineConfig({
  test: {
    include: ['{packages,apps}/*/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
