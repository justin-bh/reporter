import type { Evidence } from '@reporter/shared';
import { formatDayHeading } from './format.js';

/**
 * The viewer-LOCAL calendar day as YYYY-MM-DD.
 *
 * Derived from getFullYear/getMonth/getDate so it reflects the viewer's wall
 * clock — NEVER iso.slice(0, 10) or toISOString(), which are UTC and would
 * mis-bucket evidence recorded near midnight in the viewer's timezone.
 */
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface DayGroup {
  /** localDayKey of the day. */
  key: string;
  /** formatDayHeading of the day. */
  heading: string;
  isToday: boolean;
  isYesterday: boolean;
  /** Evidence in the SAME order they arrived (server sort preserved). */
  items: Evidence[];
  /** Chronologically earliest occurredAt in the group. */
  earliestIso: string;
  /** Chronologically latest occurredAt in the group. */
  latestIso: string;
}

/**
 * Bucket pre-sorted evidence into ordered day groups, preserving incoming
 * order. Sort-agnostic: groups are emitted in first-seen order (so the result
 * inherits the server's desc/asc order), and each group's items keep their
 * incoming order. earliestIso/latestIso are computed chronologically and are
 * therefore independent of the incoming sort direction.
 */
export function groupByLocalDay(items: Evidence[]): DayGroup[] {
  const now = new Date();
  const todayKey = localDayKey(now.toISOString());
  const yesterdayKey = localDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());

  const byKey = new Map<string, DayGroup>();
  const order: string[] = [];

  for (const ev of items) {
    const key = localDayKey(ev.occurredAt);
    let group = byKey.get(key);
    if (group === undefined) {
      group = {
        key,
        heading: formatDayHeading(ev.occurredAt),
        isToday: key === todayKey,
        isYesterday: key === yesterdayKey,
        items: [],
        earliestIso: ev.occurredAt,
        latestIso: ev.occurredAt,
      };
      byKey.set(key, group);
      order.push(key);
    } else {
      const t = new Date(ev.occurredAt).getTime();
      if (t < new Date(group.earliestIso).getTime()) group.earliestIso = ev.occurredAt;
      if (t > new Date(group.latestIso).getTime()) group.latestIso = ev.occurredAt;
    }
    group.items.push(ev);
  }

  const result: DayGroup[] = [];
  for (const key of order) {
    const group = byKey.get(key);
    if (group !== undefined) result.push(group);
  }
  return result;
}
