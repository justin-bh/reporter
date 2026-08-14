import { useId } from 'react';
import { Badge, cn } from '@reporter/ui';
import type { DayGroup } from '../../lib/group-evidence.js';
import { formatTime } from '../../lib/format.js';
import { EvidenceEntryRow } from './EvidenceEntryRow.js';

/**
 * One day in the evidence journal: a sticky, collapsible header (weekday + full
 * date, satisfying the "date + day of week" ask at the group level) over a
 * threaded list of entries. Collapsed, the header still shows the day's capture
 * time-range so a closed day communicates its activity at a glance.
 */
export function EvidenceDayGroup({
  group,
  isOpen,
  onToggle,
  slug,
}: {
  group: DayGroup;
  isOpen: boolean;
  onToggle: () => void;
  slug: string;
}) {
  const listId = useId();
  const count = group.items.length;

  return (
    <section>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={listId}
        className="sticky top-0 z-10 flex w-full items-center gap-2 rounded-card border border-border bg-surface-2 px-4 py-2 text-left transition-colors hover:border-accent/50"
      >
        <span aria-hidden className={cn('text-muted transition-transform', isOpen && 'rotate-90')}>
          ▸
        </span>
        <span className="text-sm font-semibold text-text">{group.heading}</span>
        {group.isToday ? (
          <Badge tone="accent">Today</Badge>
        ) : group.isYesterday ? (
          <Badge tone="neutral">Yesterday</Badge>
        ) : null}
        <span className="ml-auto text-xs text-muted">
          {isOpen
            ? `${count} ${count === 1 ? 'item' : 'items'}`
            : `${formatTime(group.earliestIso)} – ${formatTime(group.latestIso)}`}
        </span>
      </button>
      {isOpen && (
        <ul id={listId} className="mt-2 flex flex-col gap-2 border-l border-border pl-3">
          {group.items.map((ev) => (
            <EvidenceEntryRow key={ev.uuid} slug={slug} ev={ev} />
          ))}
        </ul>
      )}
    </section>
  );
}
