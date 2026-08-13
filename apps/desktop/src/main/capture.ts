import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platform } from 'node:process';
import { getCaptureCommand } from './settings.js';

export type CaptureMode = 'area' | 'window';

/** Run a command, resolving when it exits (success detected by file existence). */
function run(command: string, args: string[], useShell = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: useShell, stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', () => resolve());
  });
}

/**
 * Capture a screenshot to a temp PNG and return its path, or null if the user
 * cancelled (no file produced). macOS uses the native `screencapture`; other
 * platforms use the configurable capture command (with a `$FILE` placeholder).
 */
export async function captureScreenshot(mode: CaptureMode): Promise<string | null> {
  const file = join(tmpdir(), `reporter-${randomUUID()}.png`);

  if (platform === 'darwin') {
    const args = mode === 'window' ? ['-w', file] : ['-i', file];
    await run('screencapture', args);
  } else {
    const template = getCaptureCommand();
    if (!template) {
      throw new Error(
        'No capture command is configured. Set one in Settings → Capture command (use $FILE for the output path).',
      );
    }
    const cmd = template.replace(/\$FILE/g, quotePath(file));
    await run(cmd, [], true);
  }

  // If the user cancelled, no (or an empty) file exists.
  try {
    const s = await stat(file);
    if (s.size === 0) return null;
  } catch {
    return null;
  }
  return file;
}

function quotePath(p: string): string {
  return platform === 'win32' ? `"${p}"` : `'${p.replace(/'/g, "'\\''")}'`;
}
