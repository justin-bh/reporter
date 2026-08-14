import { formatDateTime, formatRelative, formatTime } from '../../lib/format.js';

/**
 * A compact left-aligned timestamp column for a journal entry: the wall-clock
 * time on top, "how long ago" beneath. The full weekday+date+time is available
 * on hover / to assistive tech via the <time> title (the day header carries the
 * weekday+date visibly, so it isn't repeated on every row).
 */
export function TimestampRail({ iso }: { iso: string }) {
  return (
    <time
      dateTime={iso}
      title={formatDateTime(iso)}
      className="flex w-16 flex-none flex-col leading-tight"
    >
      <span className="text-xs font-medium tabular-nums text-text">{formatTime(iso)}</span>
      <span className="text-xs text-muted">{formatRelative(iso)}</span>
    </time>
  );
}
