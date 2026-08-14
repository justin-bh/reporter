import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
  version: string;
  homepage?: string;
};

/** Short git SHA of the build, or 'unknown' outside a git checkout (e.g. a tarball). */
function gitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

// Build-time metadata, replaced literally in the main bundle (see src/env.d.ts).
// CI can override GIT_COMMIT / BUILD_DATE for reproducible builds.
const buildInfoDefine = {
  __APP_VERSION__: JSON.stringify(pkg.version),
  __APP_HOMEPAGE__: JSON.stringify(pkg.homepage ?? ''),
  __GIT_COMMIT__: JSON.stringify(process.env['GIT_COMMIT'] ?? gitCommit()),
  __BUILD_DATE__: JSON.stringify(process.env['BUILD_DATE'] ?? new Date().toISOString()),
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: buildInfoDefine,
    build: { rollupOptions: { input: resolve('src/main/index.ts') } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve('src/preload/index.ts') } },
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: { input: resolve('src/renderer/index.html') },
    },
  },
});
