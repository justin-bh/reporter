import { describe, expect, it } from 'vitest';
import type { Evidence } from '@reporter/shared';
import { groupByLocalDay, localDayKey } from './group-evidence.js';

/** Minimal Evidence factory: only occurredAt matters for grouping. */
function makeEv(iso: string, uuid = iso): Evidence {
  return {
    uuid,
    engagementSlug: 'eng',
    operator: { slug: 'op', firstName: 'Op', lastName: 'Erator' },
    description: '',
    contentType: 'note',
    occurredAt: iso,
    createdAt: iso,
    tags: [],
    hasContent: false,
    hasThumbnail: false,
  } as unknown as Evidence;
}

describe('groupByLocalDay', () => {
  it('buckets multiple days and emits groups in first-seen order', () => {
    // Newest-first, as the server typically returns. Use midday times to stay
    // clear of timezone-sensitive midnight boundaries.
    const items = [
      makeEv('2026-08-14T15:00:00Z', 'a'),
      makeEv('2026-08-14T09:00:00Z', 'b'),
      makeEv('2026-08-13T20:00:00Z', 'c'),
      makeEv('2026-08-12T12:00:00Z', 'd'),
    ];

    const groups = groupByLocalDay(items);

    expect(groups).toHaveLength(3);
    // First-seen order preserved (matches the incoming desc order).
    expect(groups.map((g) => g.key)).toEqual([
      localDayKey('2026-08-14T15:00:00Z'),
      localDayKey('2026-08-13T20:00:00Z'),
      localDayKey('2026-08-12T12:00:00Z'),
    ]);
    // The two same-day items land in the first group.
    expect(groups[0]?.items.map((e) => e.uuid)).toEqual(['a', 'b']);
    expect(groups[1]?.items.map((e) => e.uuid)).toEqual(['c']);
    expect(groups[2]?.items.map((e) => e.uuid)).toEqual(['d']);
  });

  it('preserves incoming order within a group', () => {
    const items = [
      makeEv('2026-08-14T18:00:00Z', 'late'),
      makeEv('2026-08-14T06:00:00Z', 'early'),
      makeEv('2026-08-14T12:00:00Z', 'mid'),
    ];

    const groups = groupByLocalDay(items);

    expect(groups).toHaveLength(1);
    // Order is exactly as supplied, NOT chronologically re-sorted.
    expect(groups[0]?.items.map((e) => e.uuid)).toEqual(['late', 'early', 'mid']);
  });

  it('computes earliestIso/latestIso chronologically regardless of input order', () => {
    // Deliberately jumbled order within the same local day.
    const items = [
      makeEv('2026-08-14T12:00:00Z', 'mid'),
      makeEv('2026-08-14T18:00:00Z', 'late'),
      makeEv('2026-08-14T06:00:00Z', 'early'),
    ];

    const groups = groupByLocalDay(items);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.earliestIso).toBe('2026-08-14T06:00:00Z');
    expect(groups[0]?.latestIso).toBe('2026-08-14T18:00:00Z');
  });

  it('produces an empty array for no items', () => {
    expect(groupByLocalDay([])).toEqual([]);
  });
});

describe('localDayKey', () => {
  it('uses LOCAL time, not UTC (near-midnight case)', () => {
    // Construct an instant that is a KNOWN local wall-clock time, then verify
    // the key matches that local calendar date rather than the UTC date.
    // 2026-08-14 23:30 local -> may be a different UTC date depending on tz.
    const local = new Date(2026, 7 /* Aug */, 14, 23, 30, 0);
    const iso = local.toISOString();

    // Expected key derived the same way the implementation should: local parts.
    const expected = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(
      local.getDate(),
    ).padStart(2, '0')}`;

    expect(localDayKey(iso)).toBe(expected);
    expect(localDayKey(iso)).toBe('2026-08-14');

    // Guard against a UTC-slice implementation: if the local->UTC shift crosses
    // midnight, iso.slice(0,10) would differ from the local key. When they
    // differ, this asserts we did NOT fall back to the UTC slice.
    const utcSlice = iso.slice(0, 10);
    if (utcSlice !== expected) {
      expect(localDayKey(iso)).not.toBe(utcSlice);
    }
  });
});
