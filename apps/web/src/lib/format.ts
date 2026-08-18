export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Local wall-clock time, e.g. "2:14 PM". */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Long weekday + full date, e.g. "Thursday, August 14, 2026". */
export function formatDayHeading(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Date only (no time), e.g. "Aug 18, 2026", in the viewer's local time zone —
 * consistent with the other formatters here. Engagement dates are a mix of
 * server-set instants (`startedAt` defaults to now(); `actualEndAt` is stamped on
 * completion) and dates picked in an `<input type="date">`; formatting them
 * locally keeps "Started <today>" honest for the operator who just created the
 * engagement, rather than jumping a day for anyone west of UTC.
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** ISO datetime → "YYYY-MM-DD" for an `<input type="date">` value, in local time. */
export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * "YYYY-MM-DD" from an `<input type="date">` → an ISO datetime at LOCAL midnight
 * (built from the parts so it isn't parsed as UTC), or null when the field is
 * cleared. Pairs with {@link toDateInputValue} for a clean local round-trip.
 */
export function fromDateInput(ymd: string): string | null {
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toISOString();
}

export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.round((Date.now() - then) / 1000);
  const abs = Math.abs(secs);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, secondsIn] of units) {
    if (abs >= secondsIn) return rtf.format(-Math.round(secs / secondsIn), unit);
  }
  return rtf.format(-secs, 'second');
}
