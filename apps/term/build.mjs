// Bundle reporter-term to a single ESM file, keeping node-pty external (native
// addon can't be embedded). Distributed via npm; node-pty installs alongside.
import { build } from 'esbuild';
import { chmod } from 'node:fs/promises';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['node-pty'],
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire } from 'node:module';const require=createRequire(import.meta.url);",
  },
});

await chmod('dist/index.js', 0o755);
console.log('Built dist/index.js');
