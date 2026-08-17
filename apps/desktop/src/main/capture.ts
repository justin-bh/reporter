import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platform } from 'node:process';
import { fileURLToPath } from 'node:url';
import { getCaptureCommand } from './settings.js';

export type CaptureMode = 'area' | 'window';

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const firstToken = (t: string): string => t.trim().split(/\s+/)[0] ?? 'screenshot tool';

/** Result of running an external capture tool. */
interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
}

/**
 * Run a command to completion. Rejects only when the process can't be spawned
 * (e.g. the binary isn't on PATH); a non-zero *exit* resolves with its code and
 * stderr so the caller can tell a real failure from a user cancel. stderr is
 * captured (not discarded) so failures are diagnosable instead of silent.
 */
function run(command: string, args: string[], useShell = false): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: useShell, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stderr: stderr.trim() }));
  });
}

/** Does an executable named `bin` exist on PATH? (POSIX `command -v`.) */
function hasBinary(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', 'command -v "$1" >/dev/null 2>&1', 'sh', bin], {
      stdio: 'ignore',
    });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

export type SessionType = 'wayland' | 'x11' | 'unknown';
export function sessionType(): SessionType {
  const t = (process.env['XDG_SESSION_TYPE'] ?? '').toLowerCase();
  if (t === 'wayland' || process.env['WAYLAND_DISPLAY']) return 'wayland';
  if (t === 'x11' || process.env['DISPLAY']) return 'x11';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// XDG desktop portal (Wayland-first, the only reliable path on modern GNOME)
// ---------------------------------------------------------------------------

// gnome-screenshot lost access to GNOME Shell's private screenshot D-Bus API in
// GNOME 49 (Ubuntu 25.10 / 26.04): on Wayland it now errors and writes no file,
// so it can no longer back the Capture buttons. The org.freedesktop.portal
// Screenshot interface is the officially-supported, desktop-agnostic replacement
// — on GNOME it shows Shell's own Screen/Window/Selection picker (interactive),
// captures real compositor output (never a black XWayland grab), and returns the
// cropped PNG as a file:// URI. It works on GNOME/KDE/wlroots (X11 + Wayland).
const PORTAL_DEST = 'org.freedesktop.portal.Desktop';
const PORTAL_PATH = '/org/freedesktop/portal/desktop';
// Interactive capture waits on the human picking a region, so allow generous time.
const PORTAL_TIMEOUT_MS = 180_000;

/**
 * Take an interactive screenshot via the XDG desktop portal and copy the result
 * to `file`. Returns 'ok' when an image was written, or 'cancelled' when the
 * user dismissed the picker. Throws when the portal is unavailable or errors —
 * the caller then falls back to the CLI tools.
 *
 * dbus-next is loaded lazily (Linux-only) and, because `usocket` is never
 * compiled in this repo, transparently talks to the systemd session bus over
 * Node's built-in `net` — no native module, no ABI-rebuild step.
 */
async function captureViaPortal(file: string): Promise<'ok' | 'cancelled'> {
  const mod = (await import('dbus-next')) as unknown as {
    default?: unknown;
    sessionBus: () => unknown;
    Variant: new (sig: string, val: unknown) => unknown;
  };
  const dbus: any = (mod as { default?: unknown }).default ?? mod;
  const bus: any = dbus.sessionBus();

  try {
    const portal = await bus.getProxyObject(PORTAL_DEST, PORTAL_PATH);
    const screenshot = portal.getInterface('org.freedesktop.portal.Screenshot');

    const token = `reporter_${randomUUID().replace(/-/g, '')}`;
    const handle: string = await screenshot.Screenshot('', {
      handle_token: new dbus.Variant('s', token),
      interactive: new dbus.Variant('b', true),
      modal: new dbus.Variant('b', true),
    });

    const reqObj = await bus.getProxyObject(PORTAL_DEST, handle);
    const request = reqObj.getInterface('org.freedesktop.portal.Request');

    const uri = await new Promise<string | null>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('the screenshot portal did not respond in time')),
        PORTAL_TIMEOUT_MS,
      );
      // Response(u response, a{sv} results): 0 = success, 1 = user cancelled, 2 = other error.
      request.on('Response', (response: number, results: Record<string, unknown>) => {
        clearTimeout(timer);
        if (response === 0) {
          const raw = results?.['uri'];
          const value =
            raw && typeof raw === 'object' && 'value' in raw
              ? (raw as { value: unknown }).value
              : raw;
          if (typeof value === 'string' && value) resolve(value);
          else reject(new Error('the screenshot portal returned no image'));
        } else if (response === 1) {
          resolve(null);
        } else {
          reject(new Error(`the screenshot portal reported an error (code ${response})`));
        }
      });
    });

    if (uri === null) return 'cancelled';
    const src = uri.startsWith('file://') ? fileURLToPath(uri) : uri;
    await copyFile(src, file);
    return 'ok';
  } finally {
    try {
      bus.disconnect?.();
    } catch {
      // best effort — the connection is torn down when the process exits anyway.
    }
  }
}

// ---------------------------------------------------------------------------
// CLI screenshot tools (fallback, and the primary path on X11)
// ---------------------------------------------------------------------------

/** Known Linux screenshot tools, best-first, with area/window command templates. */
interface LinuxTool {
  bins: string[]; // every listed binary must be present
  area: string;
  window: string;
  sessions?: SessionType[]; // restrict to these session types (omitted = any)
}
const LINUX_TOOLS: LinuxTool[] = [
  // GNOME — reliable on X11 (on Wayland the portal above is used instead).
  {
    bins: ['gnome-screenshot'],
    area: 'gnome-screenshot -a -f $FILE',
    window: 'gnome-screenshot -w -f $FILE',
  },
  // KDE — X11 and Wayland.
  {
    bins: ['spectacle'],
    area: 'spectacle -b -n -r -o $FILE',
    window: 'spectacle -b -n -a -o $FILE',
  },
  // wlroots compositors (sway / Hyprland) — Wayland only.
  {
    bins: ['grim', 'slurp'],
    area: 'grim -g "$(slurp)" $FILE',
    window: 'grim $FILE',
    sessions: ['wayland'],
  },
  // X11 utilities.
  { bins: ['maim'], area: 'maim -s $FILE', window: 'maim -s $FILE', sessions: ['x11'] },
  { bins: ['scrot'], area: 'scrot -s $FILE', window: 'scrot -u $FILE', sessions: ['x11'] },
  { bins: ['import'], area: 'import $FILE', window: 'import -window root $FILE', sessions: ['x11'] },
];

/**
 * Pick the first known tool whose binaries are all present and that is allowed
 * for `session`. Pure (no I/O) so it can be unit-tested; `isPresent` reports
 * whether every binary in a tool is installed.
 */
export function selectToolTemplate(
  session: SessionType,
  isPresent: (bins: string[]) => boolean,
  mode: CaptureMode,
): string | null {
  for (const tool of LINUX_TOOLS) {
    if (tool.sessions && session !== 'unknown' && !tool.sessions.includes(session)) continue;
    if (isPresent(tool.bins)) return mode === 'window' ? tool.window : tool.area;
  }
  return null;
}

/**
 * Classify the outcome of a CLI capture from its exit code and whether a file
 * was produced. A clean exit (0/null) with no file is a genuine user cancel; a
 * non-zero exit with no file is a real error that must be surfaced, never
 * silently swallowed as a cancel. Pure, so it is unit-tested.
 */
export function classifyCliResult(
  code: number | null,
  produced: boolean,
): 'success' | 'cancelled' | 'error' {
  if (produced) return 'success';
  if (code === 0 || code === null) return 'cancelled';
  return 'error';
}

/**
 * Choose a capture command template for `mode` on Linux:
 *   1. the user's configured command, if its binary is installed;
 *   2. otherwise the first known tool that's installed (session-aware);
 *   3. otherwise throw a clear, actionable error.
 * `$FILE` in the returned template is substituted by the caller.
 */
async function resolveLinuxTemplate(mode: CaptureMode): Promise<string> {
  const configured = getCaptureCommand().trim();
  const configuredBin = configured.split(/\s+/)[0] ?? '';
  if (configuredBin && (await hasBinary(configuredBin))) return configured;

  const session = sessionType();
  const presence = new Map<string, boolean>();
  for (const tool of LINUX_TOOLS) {
    for (const b of tool.bins) {
      if (!presence.has(b)) presence.set(b, await hasBinary(b));
    }
  }
  const isPresent = (bins: string[]): boolean => bins.every((b) => presence.get(b) === true);
  const template = selectToolTemplate(session, isPresent, mode);
  if (template) return template;

  const prefix = configuredBin
    ? `The configured capture command ("${configuredBin}") isn't installed, and n`
    : 'N';
  throw new Error(
    `${prefix}o screenshot tool was found on PATH (session: ${session}). Install one — ` +
      'e.g. `sudo apt install xdg-desktop-portal-gnome` (Wayland) or `gnome-screenshot` (X11) — ' +
      'or set a working command in Settings → Capture command (use $FILE for the output path).',
  );
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/** True with a short retry, since a tool may flush the file just after exiting. */
async function produced(file: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const s = await stat(file);
      if (s.size > 0) return true;
    } catch {
      // not written (yet)
    }
    if (attempt < 2) await delay(100);
  }
  return false;
}

/**
 * Capture a screenshot to a temp PNG and return its path, or null if the user
 * cancelled. Throws with a clear, user-facing message (shown as a toast) when
 * capture genuinely fails — a failure is never silently swallowed as a cancel.
 *
 * - macOS: native `screencapture`.
 * - Linux Wayland: the XDG desktop portal (interactive), falling back to CLI
 *   tools only if no portal backend answers.
 * - Linux X11: the auto-detected/configured CLI tool.
 * - Other: the configured command.
 */
export async function captureScreenshot(mode: CaptureMode): Promise<string | null> {
  const file = join(tmpdir(), `reporter-${randomUUID()}.png`);

  if (platform === 'darwin') {
    const args = mode === 'window' ? ['-w', file] : ['-i', file];
    await run('screencapture', args);
    return (await produced(file)) ? file : null;
  }

  if (platform === 'linux') {
    const session = sessionType();
    // Portal first on Wayland (gnome-screenshot is broken there) and when the
    // session is unknown; on a known X11 session the CLI tools are proven, so
    // keep using them directly.
    if (session === 'wayland' || session === 'unknown') {
      try {
        const result = await captureViaPortal(file);
        if (result === 'cancelled') return null;
        if (await produced(file)) return file;
        console.warn('[reporter] portal reported success but wrote no file; trying CLI tools');
      } catch (err) {
        console.warn(
          '[reporter] screenshot portal unavailable, falling back to CLI tools:',
          msg(err),
        );
      }
    }

    const template = await resolveLinuxTemplate(mode);
    const bin = firstToken(template);
    const res = await run(template.replace(/\$FILE/g, quotePath(file)), [], true);
    if (await produced(file)) return file;
    if (classifyCliResult(res.code, false) === 'error') {
      throw new Error(
        `The screenshot tool "${bin}" failed (exit ${res.code})${res.stderr ? `: ${res.stderr}` : ''}. ` +
          'On GNOME Wayland (Ubuntu 25.10+/26.04) gnome-screenshot no longer works — install a ' +
          'desktop portal with `sudo apt install xdg-desktop-portal-gnome`, or set a working ' +
          'command in Settings → Capture command.',
      );
    }
    return null; // clean exit, no file → user cancelled
  }

  // Windows / other: use the configured command as-is.
  const template = getCaptureCommand().trim();
  if (!template) {
    throw new Error(
      'No capture command is configured. Set one in Settings → Capture command (use $FILE for the output path).',
    );
  }
  await run(template.replace(/\$FILE/g, quotePath(file)), [], true);
  return (await produced(file)) ? file : null;
}

function quotePath(p: string): string {
  return platform === 'win32' ? `"${p}"` : `'${p.replace(/'/g, "'\\''")}'`;
}
