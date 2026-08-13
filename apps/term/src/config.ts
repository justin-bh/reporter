import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import envPaths from 'env-paths';

export interface TermConfig {
  serverUrl: string;
  accessKey: string;
  /** Secret key, base64 (as issued by the server). */
  secretKey: string;
  /** Preferred shell; defaults to $SHELL / platform default. */
  shell?: string;
  /** Directory where recordings are saved. */
  outputDir: string;
}

const paths = envPaths('reporter-term', { suffix: '' });
export const CONFIG_PATH = join(paths.config, 'config.json');

export function defaultShell(): string {
  if (platform() === 'win32') return process.env.COMSPEC ?? 'powershell.exe';
  return process.env.SHELL ?? '/bin/bash';
}

export function defaultOutputDir(): string {
  return join(homedir(), 'reporter-recordings');
}

export async function loadConfig(): Promise<TermConfig | null> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(raw) as TermConfig;
  } catch {
    return null;
  }
}

export async function saveConfig(config: TermConfig): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}
