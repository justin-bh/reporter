import { useState } from 'react';
import { Button, Card, MarkdownField, MarkdownPreview, Spinner, useToast } from '@reporter/ui';
import { parseHttpExchanges, type Evidence } from '@reporter/shared';
import { useUpdateEvidence } from '../../api/hooks.js';
import { useEvidenceText } from '../../hooks/useEvidenceText.js';
import { READ_ONLY_TITLE } from '../../lib/permissions.js';
import { EvidenceContent } from './EvidenceContent.js';
import { HttpRequestField } from './HttpRequestField.js';
import { HttpExchangeView } from './HttpExchangeView.js';

/** Evidence content types whose body is editable text. */
const EDITABLE_TEXT_TYPES = ['none', 'event', 'codeblock', 'http-request-cycle'];

/**
 * The evidence's main content body. For editable text types (note/event/codeblock/
 * HTTP) it renders the body read-only with an explicit Edit → Save/Cancel flow
 * (deliberate: clicking away never saves), keeping the markdown / HTTP field-value
 * preview. Non-text types (image/recording) fall back to the read-only viewer.
 */
export function EvidenceBody({
  slug,
  evidence,
  canWrite,
}: {
  slug: string;
  evidence: Evidence;
  canWrite: boolean;
}) {
  if (!EDITABLE_TEXT_TYPES.includes(evidence.contentType)) {
    return <EvidenceContent evidence={evidence} slug={slug} showCaption={false} />;
  }
  return <EditableBody slug={slug} evidence={evidence} canWrite={canWrite} />;
}

function EditableBody({
  slug,
  evidence,
  canWrite,
}: {
  slug: string;
  evidence: Evidence;
  canWrite: boolean;
}) {
  const toast = useToast();
  const update = useUpdateEvidence(slug);
  const isHttp = evidence.contentType === 'http-request-cycle';
  // Cache-bust on updatedAt so a just-saved edit shows immediately; blob-less
  // notes/events have nothing to fetch.
  const { loading, text, error } = useEvidenceText(
    slug,
    evidence.uuid,
    evidence.updatedAt,
    evidence.hasContent,
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setDraft(text);
    setEditing(true);
  }
  function cancel() {
    setEditing(false);
    setDraft('');
  }
  async function save() {
    setSaving(true);
    try {
      await update.mutateAsync({ uuid: evidence.uuid, patch: { content: draft } });
      toast.success('Content saved');
      setEditing(false);
      setDraft('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save content');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="min-w-0 space-y-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">Content</h3>
        {!editing ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={startEdit}
            disabled={!canWrite || loading}
            title={canWrite ? undefined : READ_ONLY_TITLE}
          >
            Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} loading={saving}>
              Save
            </Button>
          </div>
        )}
      </div>

      {editing ? (
        isHttp ? (
          <HttpRequestField id="ev-body" value={draft} onChange={setDraft} rows={14} />
        ) : (
          <MarkdownField
            id="ev-body"
            value={draft}
            onChange={setDraft}
            rows={12}
            className={evidence.contentType === 'codeblock' ? 'font-mono' : undefined}
          />
        )
      ) : loading ? (
        <Spinner />
      ) : error ? (
        <p className="text-sm text-danger">Couldn’t load the content.</p>
      ) : (
        <BodyView contentType={evidence.contentType} text={text} />
      )}
    </Card>
  );
}

/** Read-only render of the saved body: JSON field/value for HTTP, else markdown. */
function BodyView({ contentType, text }: { contentType: string; text: string }) {
  if (contentType === 'http-request-cycle') {
    const parsed = parseHttpExchanges(text);
    if (parsed.ok) {
      return (
        <div className="min-w-0 rounded-card border border-border bg-surface-2 p-4">
          <HttpExchangeView entries={parsed.entries} />
        </div>
      );
    }
    return (
      <pre className="min-w-0 overflow-auto rounded-card border border-border bg-surface-2 p-4 text-xs">
        <code className="font-mono">{text}</code>
      </pre>
    );
  }
  if (!text.trim()) {
    return <p className="text-sm text-muted">No content yet. Use “Edit” to add it.</p>;
  }
  return (
    <div className="min-w-0 break-words rounded-card border border-border bg-surface-2 p-4 text-sm text-text">
      <MarkdownPreview source={text} />
    </div>
  );
}
