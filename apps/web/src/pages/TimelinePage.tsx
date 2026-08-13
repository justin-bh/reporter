import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Badge, Button, EmptyState, Input, Spinner, TagChip } from '@reporter/ui';
import { EVIDENCE_TYPE_LABELS, type Evidence } from '@reporter/shared';
import { useTimeline } from '../api/hooks.js';
import { CreateEvidenceModal } from '../components/evidence/CreateEvidenceModal.js';
import { evidenceThumbUrl } from '../lib/urls.js';
import { formatRelative } from '../lib/format.js';

export function TimelinePage() {
  const { slug = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const page = Number(params.get('page') ?? '1');
  const [queryInput, setQueryInput] = useState(q);
  const [adding, setAdding] = useState(false);

  const { data, isLoading, isError } = useTimeline(slug, q, page);

  function runSearch(e: FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(params);
    if (queryInput) next.set('q', queryInput);
    else next.delete('q');
    next.delete('page');
    setParams(next);
  }

  function goPage(p: number) {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    setParams(next);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form onSubmit={runSearch} className="flex flex-1 gap-2">
          <Input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder='Filter — e.g. tag:sqli type:image operator:olivia "reflected xss"'
            aria-label="Filter evidence"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        <Button onClick={() => setAdding(true)}>Add evidence</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size={26} />
        </div>
      ) : isError ? (
        <p className="text-danger">Couldn't load the timeline.</p>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title={q ? 'No evidence matches your filter' : 'No evidence yet'}
          description={
            q
              ? 'Try a broader query, or clear the filter.'
              : 'Capture your first screenshot with the desktop app, record a terminal session, or add evidence here.'
          }
          action={<Button onClick={() => setAdding(true)}>Add evidence</Button>}
        />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {data.items.map((ev) => (
              <EvidenceRow key={ev.uuid} slug={slug} ev={ev} />
            ))}
          </ul>
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => goPage(page - 1)}>
                Previous
              </Button>
              <span className="text-muted">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => goPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      <CreateEvidenceModal slug={slug} open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function EvidenceRow({ slug, ev }: { slug: string; ev: Evidence }) {
  return (
    <li>
      <Link
        to={`/operations/${slug}/evidence/${ev.uuid}`}
        className="flex items-center gap-3 rounded-card border border-border bg-surface p-3 transition-colors hover:border-accent/50"
      >
        <div className="h-12 w-12 flex-none overflow-hidden rounded-input border border-border bg-surface-2">
          {ev.hasThumbnail ? (
            <img src={evidenceThumbUrl(slug, ev.uuid)} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg text-muted">
              {TYPE_ICON[ev.contentType] ?? '•'}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text">
            {ev.description || <span className="text-muted">No description</span>}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge tone="neutral">{EVIDENCE_TYPE_LABELS[ev.contentType]}</Badge>
            <span>
              {ev.operator.firstName} {ev.operator.lastName}
            </span>
            <span>· {formatRelative(ev.occurredAt)}</span>
            {ev.tags.slice(0, 4).map((t) => (
              <TagChip key={t.id} name={t.name} colorName={t.colorName} />
            ))}
          </div>
        </div>
      </Link>
    </li>
  );
}

const TYPE_ICON: Record<string, string> = {
  image: '🖼',
  codeblock: '⌨',
  'terminal-recording': '▸',
  'http-request-cycle': '⇄',
  event: '⚑',
  none: '✎',
};
