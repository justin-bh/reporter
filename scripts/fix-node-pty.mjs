// pnpm can drop the execute bit on node-pty's `spawn-helper` prebuild during
// extraction, which makes reporter-term fail with "posix_spawnp failed". Restore
// it after install. No-op when node-pty or the prebuilds are absent.
import { chmod, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const base = 'node_modules/node-pty/prebuilds';

try {
  const dirs = await readdir(base);
  for (const dir of dirs) {
    const helper = join(base, dir, 'spawn-helper');
    try {
      await stat(helper);
      await chmod(helper, 0o755);
    } catch {
      // no spawn-helper for this platform (e.g. Windows) — skip
    }
  }
} catch {
  // node-pty not installed — nothing to fix
}
