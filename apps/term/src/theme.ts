/**
 * The reporter brand translated to the terminal. Uses the same palette as the
 * GUI (teal accent, status hues) and matching success/error symbols, so the CLI
 * feels like the same product. No raw ANSI codes elsewhere — import from here.
 */
const enabled = process.stdout.isTTY && process.env.NO_COLOR === undefined;

function wrap(open: string): (s: string) => string {
  return (s: string) => (enabled ? `${open}${s}\x1b[0m` : s);
}

export const c = {
  accent: wrap('\x1b[38;2;45;212;191m'), // teal
  success: wrap('\x1b[38;2;61;220;132m'),
  warning: wrap('\x1b[38;2;240;180;41m'),
  danger: wrap('\x1b[38;2;255;107;107m'),
  muted: wrap('\x1b[38;2;154;164;178m'),
  bold: wrap('\x1b[1m'),
};

export const sym = {
  ok: c.success('✔'),
  err: c.danger('✖'),
  warn: c.warning('⚠'),
  prompt: c.accent('›'),
};

/** The reporter wordmark line for the CLI banner. */
export function banner(): string {
  return `${c.accent(c.bold('reporter'))} ${c.muted('· terminal recorder')}`;
}
