// Produce an installable npm tarball for reporter-term.
//
// The esbuild bundle (dist/index.js) already inlines @clack/prompts, commander,
// env-paths, and the @reporter/* workspace packages — only node-pty stays
// external (native addon). So the published package needs just node-pty as a
// runtime dependency, NOT the workspace refs from the dev manifest.
//
// We build the tarball with `tar` directly: an npm tarball is just a gzipped tar
// whose entries live under `package/`, and `npm install` accepts that. (Using
// `npm pack` here is unreliable — under pnpm it writes to the workspace root
// regardless of cwd.)
//
// Run from anywhere (via `pnpm --filter @reporter/term pack`).
import { execSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const termDir = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // apps/term
const src = JSON.parse(await readFile(join(termDir, 'package.json'), 'utf8'));
const tgz = `reporter-term-${src.version}.tgz`;

const work = join(tmpdir(), `reporter-term-pack-${src.version}`);
const pkg = join(work, 'package'); // npm tarballs are rooted at package/
await rm(work, { recursive: true, force: true });
await mkdir(join(pkg, 'dist'), { recursive: true });
await cp(join(termDir, 'dist/index.js'), join(pkg, 'dist/index.js'));
await cp(join(termDir, 'README.md'), join(pkg, 'README.md')).catch(() => {});

const pub = {
  name: 'reporter-term',
  version: src.version,
  description: src.description,
  type: 'module',
  bin: { 'reporter-term': 'dist/index.js' },
  files: ['dist', 'README.md'],
  engines: { node: '>=20' },
  dependencies: { 'node-pty': src.dependencies['node-pty'] },
};
await writeFile(join(pkg, 'package.json'), JSON.stringify(pub, null, 2) + '\n');

execSync(`tar -czf "${join(termDir, tgz)}" -C "${work}" package`, { stdio: 'inherit' });
await rm(work, { recursive: true, force: true });

console.log(`Tarball: apps/term/${tgz}`);
console.log(`Install globally with:  npm install -g ./apps/term/${tgz}`);
