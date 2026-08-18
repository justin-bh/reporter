import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Spinner,
  useConfirm,
  useToast,
} from '@reporter/ui';
import { useCreateSavedQuery, useDeleteSavedQuery, useSavedQueries } from '../api/hooks.js';
import { READ_ONLY_TITLE, useEngagementPermissions } from '../lib/permissions.js';

export function QueriesPage() {
  const { slug = '' } = useParams();
  const { canWrite } = useEngagementPermissions(slug);
  const { data: queries, isLoading, isError, refetch } = useSavedQueries(slug);
  const create = useCreateSavedQuery(slug);
  const del = useDeleteSavedQuery(slug);
  const toast = useToast();
  const confirm = useConfirm();

  async function removeQuery(id: number, queryName: string) {
    const ok = await confirm({
      title: 'Delete saved query',
      message: `Delete the saved query “${queryName}”?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) del.mutate(id);
  }

  const [name, setName] = useState('');
  const [query, setQuery] = useState('');

  async function add() {
    try {
      await create.mutateAsync({ name, query, type: 'evidence' });
      setName('');
      setQuery('');
      toast.success('Query saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save query');
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <h2 className="mb-3 text-lg font-semibold text-text">Saved queries</h2>
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <ErrorState description="Couldn’t load saved queries." onRetry={() => refetch()} />
        ) : !queries || queries.length === 0 ? (
          <EmptyState
            title="No saved queries"
            description="Save a timeline filter to reuse it later."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {queries.map((q) => (
              <Card key={q.id} className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <p className="font-medium text-text">{q.name}</p>
                  <code className="block truncate font-mono text-xs text-muted">{q.query}</code>
                </div>
                <div className="flex flex-none items-center gap-2">
                  <Link to={`/engagements/${slug}/evidence?q=${encodeURIComponent(q.query)}`}>
                    <Button size="sm" variant="secondary">
                      Run
                    </Button>
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeQuery(q.id, q.name)}
                    disabled={!canWrite}
                    title={canWrite ? undefined : READ_ONLY_TITLE}
                    className="text-muted hover:text-danger disabled:opacity-50"
                    aria-label={`Delete saved query ${q.name}`}
                  >
                    ✕
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card className="h-fit space-y-4 p-4">
        <h3 className="text-sm font-semibold text-text">Save a query</h3>
        <Field label="Name" htmlFor="q-name">
          <Input
            id="q-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canWrite}
            title={canWrite ? undefined : READ_ONLY_TITLE}
          />
        </Field>
        <Field label="Query" htmlFor="q-query" hint="e.g. tag:sqli type:image">
          <Input
            id="q-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="font-mono"
            disabled={!canWrite}
            title={canWrite ? undefined : READ_ONLY_TITLE}
          />
        </Field>
        <Button
          onClick={add}
          loading={create.isPending}
          disabled={!canWrite || !name || !query}
          title={canWrite ? undefined : READ_ONLY_TITLE}
        >
          Save query
        </Button>
      </Card>
    </div>
  );
}
