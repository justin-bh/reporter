import { useEffect, useState, type FormEvent } from 'react';
import { Button, Input } from '@reporter/ui';
import { parseQuery, stringifyQuery, type ParsedQuery } from '@reporter/shared';
import { useEvidenceOperators, useTags, type EvidenceOperator } from '../../api/hooks.js';
import { ActiveFilterChips } from './ActiveFilterChips.js';
import { TagsFilter } from './filters/TagsFilter.js';
import { TypeFilter } from './filters/TypeFilter.js';
import { OperatorFilter } from './filters/OperatorFilter.js';
import { DateFilter } from './filters/DateFilter.js';
import { FindingSortControls } from './filters/FindingSortControls.js';

/** Render the free-text terms back into an editable string for the search box. */
function textToInput(text: string[]): string {
  return text.map((t) => (/\s/.test(t) ? `"${t}"` : t)).join(' ');
}

/**
 * The discoverable evidence filter. Structured controls (search, tags, type,
 * operator, date, finding, sort) plus removable active-filter chips and an
 * Advanced raw-query escape hatch. Every control reads from and writes to the
 * same `ParsedQuery` — the URL `q` param stays the single source of truth and
 * the server contract is unchanged.
 */
export function FilterBar({
  slug,
  parsed,
  onChange,
  operatorsOnPage,
  onAdd,
  onExpandAll,
  onCollapseAll,
  showGroupControls,
}: {
  slug: string;
  parsed: ParsedQuery;
  onChange: (next: ParsedQuery) => void;
  operatorsOnPage: EvidenceOperator[];
  onAdd: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  showGroupControls: boolean;
}) {
  const { data: tags = [] } = useTags(slug);
  const { data: endpointOperators } = useEvidenceOperators(slug);

  // Prefer the complete server list; fall back to operators seen on the current
  // page. Always union in any already-selected slug so an active filter is never
  // dropped from its own list.
  const bySlug = new Map((endpointOperators ?? operatorsOnPage).map((o) => [o.slug, o]));
  for (const sel of parsed.operators) {
    if (!bySlug.has(sel)) bySlug.set(sel, { slug: sel, firstName: sel, lastName: '' });
  }
  const operators = [...bySlug.values()];
  const operatorNote = endpointOperators ? undefined : 'Operators seen on this page';

  // Free-text search box: local draft, re-synced whenever the query's text changes.
  const textStr = textToInput(parsed.text);
  const [search, setSearch] = useState(textStr);
  useEffect(() => setSearch(textStr), [textStr]);

  // Advanced raw-query strip: local draft, re-synced to the canonical string.
  const canonical = stringifyQuery(parsed);
  const [advanced, setAdvanced] = useState(false);
  const [raw, setRaw] = useState(canonical);
  useEffect(() => setRaw(canonical), [canonical]);

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    onChange({ ...parsed, text: parseQuery(search).text });
  };
  const submitRaw = (e: FormEvent) => {
    e.preventDefault();
    onChange(parseQuery(raw));
  };

  return (
    <div className="rounded-card border border-border bg-surface p-2">
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={submitSearch} className="flex min-w-48 flex-1 items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search descriptions…"
            aria-label="Search evidence descriptions"
          />
        </form>

        <TagsFilter
          value={parsed.tags}
          tags={tags}
          onChange={(names) => onChange({ ...parsed, tags: names })}
        />
        <TypeFilter value={parsed.types} onChange={(types) => onChange({ ...parsed, types })} />
        <OperatorFilter
          value={parsed.operators}
          operators={operators}
          note={operatorNote}
          onChange={(slugs) => onChange({ ...parsed, operators: slugs })}
        />
        <DateFilter
          value={parsed.dateRanges[0]}
          onChange={(range) =>
            onChange({
              ...parsed,
              dateRanges: range
                ? [range, ...parsed.dateRanges.slice(1)]
                : parsed.dateRanges.slice(1),
            })
          }
        />
        <FindingSortControls
          withFinding={parsed.withFinding}
          sortAsc={parsed.sortAsc}
          onChange={(next) =>
            onChange({ ...parsed, withFinding: next.withFinding, sortAsc: next.sortAsc })
          }
        />

        <div className="ml-auto flex items-center gap-2">
          {showGroupControls && (
            <>
              <Button variant="ghost" size="sm" onClick={onExpandAll}>
                Expand all
              </Button>
              <Button variant="ghost" size="sm" onClick={onCollapseAll}>
                Collapse all
              </Button>
            </>
          )}
          <Button size="sm" onClick={onAdd}>
            Add evidence
          </Button>
        </div>
      </div>

      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <ActiveFilterChips
            parsed={parsed}
            tags={tags}
            operators={operators}
            onChange={onChange}
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAdvanced((a) => !a)}
          aria-expanded={advanced}
        >
          {advanced ? 'Hide query' : 'Advanced'}
        </Button>
      </div>

      {advanced && (
        <form onSubmit={submitRaw} className="mt-2 flex flex-col gap-1.5">
          <div className="flex gap-2">
            <Input
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              className="font-mono"
              placeholder='tag:sqli type:image operator:olivia "reflected xss"'
              aria-label="Raw filter query"
            />
            <Button type="submit" variant="secondary" size="sm">
              Apply
            </Button>
          </div>
          <p className="text-xs text-muted">
            Keys: <code>tag:</code> <code>type:</code> <code>operator:</code>{' '}
            <code>range:from,to</code> <code>uuid:</code> <code>with-finding</code>{' '}
            <code>without-finding</code> <code>sort:asc</code>. Quote multi-word values.
          </p>
        </form>
      )}
    </div>
  );
}
