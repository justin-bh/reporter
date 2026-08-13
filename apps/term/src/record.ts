import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { spawn as ptySpawn } from 'node-pty';
import { defaultShell } from './config.js';

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

  const out = createWriteStream(opts.outputPath, { encoding: 'utf8' });
  const start = performance.now();
  const elapsed = () => (performance.now() - start) / 1000;

  out.write(
    JSON.stringify({
      version: 2,
      width: cols,
      height: rows,
      timestamp: Math.floor(Date.now() / 1000),
      env: { SHELL: shell, TERM: process.env.TERM ?? 'xterm-256color' },
    }) + '\n',
  );

  const pty = ptySpawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.cwd(),
    env: process.env as Record<string, string>,
  });

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
