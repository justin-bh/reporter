import { describe, it, expect, vi } from 'vitest';

// capture.ts imports settings.ts, which imports electron/electron-store at module
// load — unavailable under vitest. Stub it; these tests exercise only the pure
// helpers, which don't touch settings.
vi.mock('./settings.js', () => ({ getCaptureCommand: () => '' }));

import { classifyCliResult, selectToolTemplate, sessionType } from './capture.js';

describe('classifyCliResult', () => {
  it('reports success whenever a file was produced, regardless of exit code', () => {
    expect(classifyCliResult(0, true)).toBe('success');
    expect(classifyCliResult(1, true)).toBe('success');
    expect(classifyCliResult(null, true)).toBe('success');
  });

  it('treats a clean exit with no file as a user cancel (not an error)', () => {
    // gnome-screenshot/screencapture exit 0 with no file when the user hits Escape.
    expect(classifyCliResult(0, false)).toBe('cancelled');
    expect(classifyCliResult(null, false)).toBe('cancelled');
  });

  it('treats a non-zero exit with no file as a real error — never a silent cancel', () => {
    // This is the Bug A regression guard: a failing tool must surface, not no-op.
    expect(classifyCliResult(1, false)).toBe('error');
    expect(classifyCliResult(2, false)).toBe('error');
    expect(classifyCliResult(127, false)).toBe('error');
  });
});

describe('selectToolTemplate', () => {
  const present =
    (...installed: string[]) =>
    (bins: string[]) =>
      bins.every((b) => installed.includes(b));

  it('prefers gnome-screenshot on X11 and picks the mode-specific template', () => {
    expect(selectToolTemplate('x11', present('gnome-screenshot'), 'area')).toBe(
      'gnome-screenshot -a -f $FILE',
    );
    expect(selectToolTemplate('x11', present('gnome-screenshot'), 'window')).toBe(
      'gnome-screenshot -w -f $FILE',
    );
  });

  it('skips X11-only tools on a Wayland session', () => {
    // maim/scrot/import are X11-only and would grab a black frame under Wayland.
    expect(selectToolTemplate('wayland', present('maim'), 'area')).toBeNull();
    expect(selectToolTemplate('wayland', present('scrot'), 'area')).toBeNull();
  });

  it('uses grim+slurp on Wayland only when both are installed', () => {
    expect(selectToolTemplate('wayland', present('grim'), 'area')).toBeNull();
    expect(selectToolTemplate('wayland', present('grim', 'slurp'), 'area')).toBe(
      'grim -g "$(slurp)" $FILE',
    );
  });

  it('returns null when nothing suitable is installed', () => {
    expect(selectToolTemplate('x11', () => false, 'area')).toBeNull();
  });
});

describe('sessionType', () => {
  const withEnv = (env: Record<string, string | undefined>, fn: () => void) => {
    const keys = ['XDG_SESSION_TYPE', 'WAYLAND_DISPLAY', 'DISPLAY'];
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    try {
      for (const k of keys) delete process.env[k];
      for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
      fn();
    } finally {
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  };

  it('detects Wayland from XDG_SESSION_TYPE or WAYLAND_DISPLAY (even if DISPLAY is set by XWayland)', () => {
    withEnv({ XDG_SESSION_TYPE: 'wayland' }, () => expect(sessionType()).toBe('wayland'));
    withEnv({ WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' }, () =>
      expect(sessionType()).toBe('wayland'),
    );
  });

  it('detects X11 and unknown', () => {
    withEnv({ XDG_SESSION_TYPE: 'x11' }, () => expect(sessionType()).toBe('x11'));
    withEnv({ DISPLAY: ':0' }, () => expect(sessionType()).toBe('x11'));
    withEnv({}, () => expect(sessionType()).toBe('unknown'));
  });
});
