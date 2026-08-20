import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Spinner,
  useConfirm,
  useToast,
} from '@reporter/ui';
import type { SavedQuery } from '@reporter/shared';
import { useDeleteSavedQuery, useSavedQueries, useUpdateSavedQuery } from '../api/hooks.js';
import { READ_ONLY_TITLE, useEngagementPermissions } from '../lib/permissions.js';

export function QueriesPage() {
  const { slug = '' } = useParams();
  const { canWrite } = useEngagementPermissions(slug);
  const { data: queries, isLoading, isError, refetch } = useSavedQueries(slug);
  const del = useDeleteSavedQuery(slug);
  const update = useUpdateSavedQuery(slug);
  const toast = useToast();
  const confirm = useConfirm();

  // The query being edited (rename / modify), or null when the editor is closed.
  const [editing, setEditing] = useState<SavedQuery | null>(null);
  const [editName, setEditName] = useState('');
  const [editQuery, setEditQuery] = useState('');

  function openEdit(q: SavedQuery) {
    setEditing(q);
    setEditName(q.name);
    setEditQuery(q.query);
  }

  async function saveEdit() {
    if (!editing) return;
    const name = editName.trim();
    const query = editQuery.trim();
    if (!name || !query) return;
    try {
      await update.mutateAsync({ id: editing.id, name, query });
      setEditing(null);
      toast.success('Query updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update query');
    }
  }

  async function removeQuery(id: number, queryName: string) {
    const ok = await confirm({
      title: 'Delete saved query',
      message: `Delete the saved query “${queryName}”?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) del.mutate(id);
  }

  return (
    <div className="min-w-0">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-text">Saved queries</h2>
        <p className="text-sm text-muted">
          Reusable evidence filters. Save one from the search bar on the Evidence tab, then run,
          rename, or edit it here.
        </p>
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <ErrorState description="Couldn’t load saved queries." onRetry={() => refetch()} />
      ) : !queries || queries.length === 0 ? (
        <EmptyState
          title="No saved queries"
          description="On the Evidence tab, filter the timeline and choose “Save query” to keep the view here."
          action={
            <Link to={`/engagements/${slug}/evidence`}>
              <Button variant="secondary">Go to Evidence</Button>
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {queries.map((q) => (
            <Card key={q.id} className="flex items-center justify-between gap-3 p-3">
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
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openEdit(q)}
                  disabled={!canWrite}
                  title={canWrite ? undefined : READ_ONLY_TITLE}
                >
                  Edit
                </Button>
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

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit saved query"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={saveEdit}
              loading={update.isPending}
              disabled={!editName.trim() || !editQuery.trim()}
            >
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name" htmlFor="edit-query-name">
            <Input
              id="edit-query-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={255}
              autoFocus
            />
          </Field>
          <Field label="Query" htmlFor="edit-query-query" hint="e.g. tag:sqli type:image">
            <Input
              id="edit-query-query"
              value={editQuery}
              onChange={(e) => setEditQuery(e.target.value)}
              className="font-mono"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
