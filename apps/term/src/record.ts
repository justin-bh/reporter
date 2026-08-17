import { chmodSync, createWriteStream, existsSync, statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
// Namespace import (not `{ createRequire }`): the esbuild bundle banner already
// declares a top-level `createRequire` binding, and a second named import of the
// same identifier makes the bundle fail to parse ("Identifier 'createRequire'
// has already been declared"). A namespace binding can't collide.
import * as nodeModule from 'node:module';
import { dirname, join } from 'node:path';
import { spawn as ptySpawn } from 'node-pty';
import { defaultShell } from './config.js';

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Where node-pty's `spawn-helper` is and whether we made it runnable. */
interface SpawnHelperInfo {
  path: string;
  executable: boolean;
  /** Owned by another user while we're not root → we can't chmod it ourselves. */
  foreignOwner: boolean;
}

/**
 * On macOS/Linux, node-pty starts sessions by `posix_spawn`-ing a small prebuilt
 * `spawn-helper` binary that ships inside the node-pty package. Some npm installs
 * land that binary without its executable bit, and node-pty then fails at spawn
 * time with the opaque `Error: posix_spawnp failed.` — exactly what a fresh
 * `npm i -g reporter-term` hits. Restore +x defensively before spawning, and
 * return what we found so a still-broken spawn can explain itself (e.g. a
 * `sudo`-installed, root-owned helper we're not allowed to chmod). No-op on
 * Windows (ConPTY has no helper).
 */
function ensureSpawnHelperExecutable(): SpawnHelperInfo | null {
  if (process.platform === 'win32') return null;
  try {
    const nodeRequire = nodeModule.createRequire(import.meta.url);
    // node-pty's entry is `lib/index.js`; its package root is two levels up.
    const nodePtyRoot = dirname(dirname(nodeRequire.resolve('node-pty')));
    const candidates = [
      join(nodePtyRoot, 'build', 'Release', 'spawn-helper'), // built from source
      join(nodePtyRoot, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'), // prebuilt
    ];
    for (const path of candidates) {
      if (!existsSync(path)) continue;
      const st = statSync(path);
      const withExec = st.mode | 0o111;
      if (withExec !== st.mode) {
        try {
          chmodSync(path, withExec);
        } catch {
          // Likely a root-owned file and we're not root — reported via foreignOwner.
        }
      }
      const now = statSync(path);
      const uid = typeof process.getuid === 'function' ? process.getuid() : now.uid;
      return {
        path,
        executable: (now.mode & 0o111) !== 0,
        foreignOwner: uid !== 0 && now.uid !== uid,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Turn a raw node-pty spawn failure into an actionable message when it's caused
 * by a non-executable `spawn-helper`; otherwise pass the original error through.
 */
function explainSpawnFailure(err: unknown, helper: SpawnHelperInfo | null): Error {
  if (helper && !helper.executable) {
    const sudo = helper.foreignOwner ? 'sudo ' : '';
    const parts = ["Couldn't start the recording shell: node-pty's spawn-helper isn't executable."];
    if (helper.foreignOwner) {
      parts.push(
        'It is owned by another user — reporter-term was likely installed with `sudo npm install`,' +
          " so it can't fix the permission itself.",
      );
    }
    parts.push('Fix it with:', `  ${sudo}chmod +x '${helper.path}'`);
    if (helper.foreignOwner) {
      parts.push('or reinstall reporter-term without sudo (a user/nvm npm prefix needs no sudo).');
    }
    parts.push(`(underlying error: ${msg(err)})`);
    return new Error(parts.join('\n'));
  }
  return err instanceof Error ? err : new Error(msg(err));
}

export interface RecordResult {
  castPath: string;
  durationMs: number;
}

/**
 * Record an interactive shell session to an asciicast v2 file. Spawns the shell
 * in a PTY sized to the current terminal, passes stdin/stdout through in raw
 * mode, and streams output events to disk as they happen (so a crash loses
 * nothing). Resolves when the shell exits (`exit` / Ctrl-D).
 */
export async function recordSession(opts: {
  shell?: string;
  outputPath: string;
}): Promise<RecordResult> {
  await mkdir(dirname(opts.outputPath), { recursive: true });

  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  const shell = opts.shell || defaultShell();

  const helper = ensureSpawnHelperExecutable();
  const start = performance.now();
  const elapsed = () => (performance.now() - start) / 1000;

  // Spawn first (before opening the .cast) so a spawn failure leaves no orphan
  // file and can be turned into an actionable message.
  let pty: ReturnType<typeof ptySpawn>;
  try {
    pty = ptySpawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    });
  } catch (err) {
    throw explainSpawnFailure(err, helper);
  }

  const out = createWriteStream(opts.outputPath, { encoding: 'utf8' });
  out.write(
    JSON.stringify({
      version: 2,
      width: cols,
      height: rows,
      timestamp: Math.floor(Date.now() / 1000),
      env: { SHELL: shell, TERM: process.env.TERM ?? 'xterm-256color' },
    }) + '\n',
  );

  const wasRaw = process.stdin.isRaw;
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();

  const onStdin = (d: Buffer) => pty.write(d.toString('utf8'));
  process.stdin.on('data', onStdin);

  const onResize = () => {
    const cc = process.stdout.columns || 80;
    const rr = process.stdout.rows || 24;
    pty.resize(cc, rr);
    out.write(JSON.stringify([elapsed(), 'r', `${cc}x${rr}`]) + '\n');
  };
  process.stdout.on('resize', onResize);

  const dataDisp = pty.onData((data) => {
    process.stdout.write(data);
    out.write(JSON.stringify([elapsed(), 'o', data]) + '\n');
  });

  return new Promise<RecordResult>((resolve) => {
    pty.onExit(() => {
      dataDisp.dispose();
      process.stdin.off('data', onStdin);
      process.stdout.off('resize', onResize);
      if (process.stdin.isTTY) process.stdin.setRawMode(wasRaw ?? false);
      process.stdin.pause();
      const durationMs = performance.now() - start;
      out.end(() => resolve({ castPath: opts.outputPath, durationMs }));
    });
  });
}
