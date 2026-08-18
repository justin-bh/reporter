import { describe, it, expect } from 'vitest';
import { parseQuery, stringifyQuery, isEmptyQuery } from './timeline-query.js';

describe('parseQuery', () => {
  it('parses free text terms', () => {
    const q = parseQuery('sql injection login');
    expect(q.text).toEqual(['sql', 'injection', 'login']);
    expect(isEmptyQuery(q)).toBe(false);
  });

  it('returns an empty query for whitespace', () => {
    const q = parseQuery('   ');
    expect(isEmptyQuery(q)).toBe(true);
  });

  it('parses tag terms including quoted multi-word values', () => {
    const q = parseQuery('tag:sqli tag:"lateral movement"');
    expect(q.tags).toEqual(['sqli', 'lateral movement']);
  });

  it('parses operator and mixes with free text', () => {
    const q = parseQuery('operator:alice foothold operator:bob');
    expect(q.operators).toEqual(['alice', 'bob']);
    expect(q.text).toEqual(['foothold']);
  });

  it('parses valid evidence types and ignores invalid ones', () => {
    const q = parseQuery('type:image type:terminal-recording type:bogus');
    expect(q.types).toEqual(['image', 'terminal-recording']);
  });

  it('parses a date range', () => {
    const q = parseQuery('range:2026-01-01,2026-01-31');
    expect(q.dateRanges).toEqual([{ from: '2026-01-01', to: '2026-01-31' }]);
  });

  it('treats a single date as a single-day range', () => {
    const q = parseQuery('range:2026-08-13');
    expect(q.dateRanges).toEqual([{ from: '2026-08-13', to: '2026-08-13' }]);
  });

  it('parses uuid filters', () => {
    const q = parseQuery('uuid:11111111-2222-3333-4444-555555555555');
    expect(q.uuids).toEqual(['11111111-2222-3333-4444-555555555555']);
  });

  it('parses with-finding / without-finding flags', () => {
    expect(parseQuery('with-finding').withFinding).toBe(true);
    expect(parseQuery('without-finding').withFinding).toBe(false);
    expect(parseQuery('nothing').withFinding).toBeUndefined();
  });

  it('parses sort direction', () => {
    expect(parseQuery('sort:asc').sortAsc).toBe(true);
    expect(parseQuery('sort:desc').sortAsc).toBe(false);
    expect(parseQuery('').sortAsc).toBe(false);
  });

  it('parses the starred flag as a bareword and as a key', () => {
    expect(parseQuery('starred').starred).toBe(true);
    expect(parseQuery('starred:true').starred).toBe(true);
    expect(parseQuery('starred:false').starred).toBe(false);
    expect(parseQuery('nothing').starred).toBeUndefined();
    expect(isEmptyQuery(parseQuery('starred'))).toBe(false);
  });

  it('keeps malformed starred values as free text', () => {
    const q = parseQuery('starred:maybe');
    expect(q.starred).toBeUndefined();
    expect(q.text).toEqual(['starred:maybe']);
    expect(parseQuery('starred:').starred).toBeUndefined();
  });

  it('parses the no-comments flag', () => {
    expect(parseQuery('no-comments').noComments).toBe(true);
    expect(parseQuery('nothing').noComments).toBeUndefined();
    expect(isEmptyQuery(parseQuery('no-comments'))).toBe(false);
  });

  it('does not misparse a URL as a key:value pair', () => {
    const q = parseQuery('https://example.com/login');
    expect(q.text).toEqual(['https://example.com/login']);
    expect(q.tags).toEqual([]);
  });

  it('parses a complex combined query', () => {
    const q = parseQuery(
      'tag:sqli tag:"priv esc" operator:alice type:image range:2026-01-01,2026-01-31 with-finding free text',
    );
    expect(q.tags).toEqual(['sqli', 'priv esc']);
    expect(q.operators).toEqual(['alice']);
    expect(q.types).toEqual(['image']);
    expect(q.dateRanges).toEqual([{ from: '2026-01-01', to: '2026-01-31' }]);
    expect(q.withFinding).toBe(true);
    expect(q.text).toEqual(['free', 'text']);
  });

  it('handles an unterminated quote gracefully', () => {
    const q = parseQuery('tag:"open ended');
    expect(q.tags).toEqual(['open ended']);
  });
});

describe('stringifyQuery / round-trip', () => {
  it('round-trips a complex query through parse → stringify → parse', () => {
    const input =
      'tag:sqli tag:"priv esc" operator:alice type:image range:2026-01-01,2026-01-31 with-finding sort:asc free text';
    const once = parseQuery(input);
    const round = parseQuery(stringifyQuery(once));
    expect(round).toEqual(once);
  });

  it('quotes values containing spaces', () => {
    const s = stringifyQuery(parseQuery('tag:"lateral movement"'));
    expect(s).toContain('tag:"lateral movement"');
  });

  it('stringifies and round-trips starred and no-comments', () => {
    expect(stringifyQuery(parseQuery('starred'))).toBe('starred');
    expect(stringifyQuery(parseQuery('starred:false'))).toBe('starred:false');
    expect(stringifyQuery(parseQuery('no-comments'))).toBe('no-comments');

    const once = parseQuery('tag:sqli starred no-comments free text');
    const round = parseQuery(stringifyQuery(once));
    expect(round).toEqual(once);
    expect(round.starred).toBe(true);
    expect(round.noComments).toBe(true);
  });
});
