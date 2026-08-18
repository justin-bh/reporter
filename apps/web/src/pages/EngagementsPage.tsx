import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  SortableTh,
  Spinner,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
  type SortDirection,
} from '@reporter/ui';
import { ENGAGEMENT_STATUSES, type Engagement, type EngagementStatus } from '@reporter/shared';
import { slugify } from '../lib/slugify.js';
import { formatDate, fromDateInput } from '../lib/format.js';
import { useCreateEngagement, useEngagements, useToggleFavorite } from '../api/hooks.js';

const STATUS_TONE = { active: 'success', complete: 'info', archived: 'neutral' } as const;

type SortColumn = 'name' | 'status' | 'evidence' | 'findings' | 'members';

// Numeric columns start descending (most first); text columns start ascending.
const FIRST_CLICK_DIRECTION: Record<SortColumn, SortDirection> = {
  name: 'asc',
  status: 'asc',
  evidence: 'desc',
  findings: 'desc',
  members: 'desc',
};

// Lifecycle order, not alphabetical.
const STATUS_ORDER: Record<EngagementStatus, number> = { active: 0, complete: 1, archived: 2 };

function compareBy(column: SortColumn, direction: SortDirection) {
  const dir = direction === 'asc' ? 1 : -1;
  return (a: Engagement, b: Engagement): number => {
    switch (column) {
      case 'name':
        return dir * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      case 'status':
        return dir * (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
      case 'evidence':
        return dir * ((a.numEvidence ?? 0) - (b.numEvidence ?? 0));
      case 'findings':
        return dir * ((a.numFindings ?? 0) - (b.numFindings ?? 0));
      case 'members':
        return dir * ((a.numUsers ?? 0) - (b.numUsers ?? 0));
    }
  };
}

/**
 * Favorites always come first. Within each partition the comparator applies;
 * without one, server order (createdAt desc) is kept — sort() is stable.
 */
function orderEngagements(
  engagements: Engagement[],
  compare?: (a: Engagement, b: Engagement) => number,
): Engagement[] {
  const favorites = engagements.filter((e) => e.favorite);
  const rest = engagements.filter((e) => !e.favorite);
  if (compare) {
    favorites.sort(compare);
    rest.sort(compare);
  }
  return [...favorites, ...rest];
}

type EngagementsView = 'card' | 'table';
const VIEW_STORAGE_KEY = 'reporter.engagementsView';

/** Persist the card/table choice across visits so the preference sticks. */
function usePersistedView(): [EngagementsView, (v: EngagementsView) => void] {
  const [view, setView] = useState<EngagementsView>(() => {
    try {
      return localStorage.getItem(VIEW_STORAGE_KEY) === 'table' ? 'table' : 'card';
    } catch {
      return 'card';
    }
  });
  const update = (v: EngagementsView) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, v);
    } catch {
      /* storage unavailable — keep the in-memory choice */
    }
  };
  return [view, update];
}

export function EngagementsPage() {
  const { data: engagements, isLoading, isError, refetch } = useEngagements();
  const [creating, setCreating] = useState(false);
  const [view, setView] = usePersistedView();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<EngagementStatus | 'all'>('all');
  // Lives here (not in EngagementsTable) so the sort survives view toggles
  // and transient zero-match states unmounting the table.
  const [sort, setSort] = useState<{ column: SortColumn; direction: SortDirection } | null>(null);

  const hasEngagements = Boolean(engagements && engagements.length > 0);
  const filtersActive = search.trim() !== '' || status !== 'all';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (engagements ?? []).filter(
      (e) =>
        (status === 'all' || e.status === status) &&
        (!q || e.name.toLowerCase().includes(q) || e.slug.toLowerCase().includes(q)),
    );
  }, [engagements, search, status]);

  const clearFilters = () => {
    setSearch('');
    setStatus('all');
  };

  const orderedCards = useMemo(() => orderEngagements(filtered), [filtered]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">Engagements</h1>
          <p className="text-sm text-muted">Engagements you can access.</p>
        </div>
        <div className="flex items-center gap-2">
          {hasEngagements && <ViewToggle view={view} onChange={setView} />}
          <Button onClick={() => setCreating(true)}>New engagement</Button>
        </div>
      </div>

      {hasEngagements && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter engagements…"
            aria-label="Filter engagements by name or slug"
            className="max-w-xs"
          />
          <div className="w-40">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as EngagementStatus | 'all')}
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              {ENGAGEMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size={26} />
        </div>
      ) : isError ? (
        <ErrorState description="Couldn’t load your engagements." onRetry={() => refetch()} />
      ) : !engagements || engagements.length === 0 ? (
        <EmptyState
          title="No engagements yet"
          description="Create your first engagement to start collecting evidence."
          action={<Button onClick={() => setCreating(true)}>New engagement</Button>}
        />
      ) : filtered.length === 0 && filtersActive ? (
        <EmptyState
          title="No engagements match your filters"
          description="Try a different search or status."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : view === 'table' ? (
        <EngagementsTable engagements={filtered} sort={sort} onSortChange={setSort} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orderedCards.map((eng) => (
            <EngagementCard key={eng.slug} eng={eng} />
          ))}
        </div>
      )}

      <CreateEngagementModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: EngagementsView;
  onChange: (v: EngagementsView) => void;
}) {
  const options: { value: EngagementsView; label: string }[] = [
    { value: 'card', label: 'Cards' },
    { value: 'table', label: 'Table' },
  ];
  return (
    <div className="inline-flex rounded-input border border-border p-0.5" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={view === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-input px-2.5 py-1 text-sm font-medium transition-colors ${
            view === o.value ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FavoriteButton({ eng }: { eng: Engagement }) {
  const toggle = useToggleFavorite(eng.slug);
  const toast = useToast();
  return (
    <button
      type="button"
      aria-label="Favorite"
      aria-pressed={Boolean(eng.favorite)}
      disabled={toggle.isPending}
      onClick={() =>
        toggle.mutate(!eng.favorite, {
          onError: (err) =>
            toast.error(err instanceof Error ? err.message : 'Could not update favorite'),
        })
      }
      className={eng.favorite ? 'text-warning' : 'text-muted hover:text-warning'}
    >
      {eng.favorite ? '★' : '☆'}
    </button>
  );
}

function EngagementCard({ eng }: { eng: Engagement }) {
  const findings = eng.numFindings ?? 0;
  return (
    <Card className="flex flex-col gap-3 p-4 transition-colors hover:border-accent/50">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/engagements/${eng.slug}/evidence`}
          className="font-semibold text-text hover:text-accent"
        >
          {eng.name}
        </Link>
        <FavoriteButton eng={eng} />
      </div>
      <div className="flex items-center gap-2 text-xs text-muted">
        <Badge tone={STATUS_TONE[eng.status]}>{eng.status}</Badge>
        <span>{eng.numEvidence ?? 0} evidence</span>
        {findings > 0 && (
          <>
            <span>·</span>
            <span>
              {findings} {findings === 1 ? 'finding' : 'findings'}
            </span>
          </>
        )}
        <span>·</span>
        <span>{eng.numUsers ?? 0} members</span>
      </div>
      <div className="text-xs text-muted">
        Started {formatDate(eng.startedAt)}
        {eng.actualEndAt
          ? ` · ended ${formatDate(eng.actualEndAt)}`
          : eng.projectedEndAt
            ? ` · due ${formatDate(eng.projectedEndAt)}`
            : ''}
      </div>
    </Card>
  );
}

type SortState = { column: SortColumn; direction: SortDirection } | null;

function EngagementsTable({
  engagements,
  sort,
  onSortChange,
}: {
  engagements: Engagement[];
  sort: SortState;
  onSortChange: (next: SortState) => void;
}) {
  const toggleSort = (column: SortColumn) =>
    onSortChange(
      sort?.column === column
        ? { column, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: FIRST_CLICK_DIRECTION[column] },
    );
  const directionOf = (column: SortColumn) =>
    sort?.column === column ? sort.direction : undefined;

  const ordered = useMemo(
    () => orderEngagements(engagements, sort ? compareBy(sort.column, sort.direction) : undefined),
    [engagements, sort],
  );

  return (
    <Table>
      <Thead>
        <Tr>
          <Th />
          <SortableTh direction={directionOf('name')} onSort={() => toggleSort('name')}>
            Name
          </SortableTh>
          <SortableTh direction={directionOf('status')} onSort={() => toggleSort('status')}>
            Status
          </SortableTh>
          <SortableTh
            align="right"
            direction={directionOf('evidence')}
            onSort={() => toggleSort('evidence')}
          >
            Evidence
          </SortableTh>
          <SortableTh
            align="right"
            direction={directionOf('findings')}
            onSort={() => toggleSort('findings')}
          >
            Findings
          </SortableTh>
          <SortableTh
            align="right"
            direction={directionOf('members')}
            onSort={() => toggleSort('members')}
          >
            Members
          </SortableTh>
        </Tr>
      </Thead>
      <Tbody>
        {ordered.map((eng) => {
          const findings = eng.numFindings ?? 0;
          return (
            <Tr key={eng.slug}>
              <Td className="w-8 text-center">
                <FavoriteButton eng={eng} />
              </Td>
              <Td>
                <Link
                  to={`/engagements/${eng.slug}/evidence`}
                  className="font-medium text-text hover:text-accent"
                >
                  {eng.name}
                </Link>
              </Td>
              <Td>
                <Badge tone={STATUS_TONE[eng.status]}>{eng.status}</Badge>
              </Td>
              <Td className="text-right tabular-nums">{eng.numEvidence ?? 0}</Td>
              <Td className="text-right tabular-nums text-muted">{findings > 0 ? findings : ''}</Td>
              <Td className="text-right tabular-nums">{eng.numUsers ?? 0}</Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
}

function CreateEngagementModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const create = useCreateEngagement();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [projectedEndAt, setProjectedEndAt] = useState('');

  const effectiveSlug = slugTouched ? slug : slugify(name);

  async function submit() {
    try {
      await create.mutateAsync({
        name,
        slug: effectiveSlug,
        projectedEndAt: fromDateInput(projectedEndAt),
      });
      toast.success('Engagement created');
      setName('');
      setSlug('');
      setSlugTouched(false);
      setProjectedEndAt('');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create engagement');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New engagement"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={!name || !effectiveSlug}>
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" htmlFor="eng-name">
          <Input id="eng-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Slug" htmlFor="eng-slug" hint="Used in URLs. Lowercase, hyphenated.">
          <Input
            id="eng-slug"
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
          />
        </Field>
        <Field
          label="Projected end date"
          htmlFor="eng-projected-end"
          hint="Optional target end date. The start date is set to today."
        >
          <Input
            id="eng-projected-end"
            type="date"
            value={projectedEndAt}
            onChange={(e) => setProjectedEndAt(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
