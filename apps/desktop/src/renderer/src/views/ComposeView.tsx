import { useEffect, useState } from 'react';
import { Button, EmptyState, Field, Input, Select, TagPicker, Textarea, useToast } from '@reporter/ui';
import type { CaptureDraft, OperationLite, TagLite } from '../../../shared/types.js';

export function ComposeView({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<CaptureDraft | null | undefined>(undefined);
  const [operations, setOperations] = useState<OperationLite[]>([]);
  const [operationSlug, setOperationSlug] = useState('');
  const [tags, setTags] = useState<TagLite[]>([]);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [language, setLanguage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const [d, settings, ops] = await Promise.all([
        window.reporter.getDraft(),
        window.reporter.getSettings(),
        window.reporter.listOperations().catch(() => [] as OperationLite[]),
      ]);
      setDraft(d);
      setContent(d?.content ?? '');
      setOperations(ops);
      setOperationSlug(settings.currentOperationSlug ?? ops[0]?.slug ?? '');
    })();
  }, []);

  useEffect(() => {
    if (!operationSlug) {
      setTags([]);
      return;
    }
    window.reporter.listTags(operationSlug).then(setTags).catch(() => setTags([]));
    setTagIds([]);
  }, [operationSlug]);

  if (draft === undefined) return <p className="text-sm text-muted">Loading…</p>;

  if (draft === null) {
    return (
      <EmptyState
        title="Nothing to compose"
        description="Capture a screenshot or add a code block from the tray, then describe it here."
        action={<Button size="sm" onClick={() => window.reporter.captureArea()}>Capture area</Button>}
      />
    );
  }

  async function submit() {
    if (!operationSlug) {
      toast.error('Choose an operation first');
      return;
    }
    setSubmitting(true);
    try {
      await window.reporter.submitDraft({
        operationSlug,
        description,
        tagIds,
        contentType: draft!.contentType,
        filePath: draft!.filePath,
        content: draft!.contentType === 'image' ? undefined : content,
        contentSubtype: draft!.contentType === 'codeblock' && language ? language : undefined,
      });
      toast.success('Queued for upload');
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not queue evidence');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {draft.contentType === 'image' && draft.previewDataUrl && (
        <img
          src={draft.previewDataUrl}
          alt="Capture preview"
          className="max-h-52 w-full rounded-card border border-border object-contain bg-surface-2"
        />
      )}

      <Field label="Operation" htmlFor="op">
        <Select id="op" value={operationSlug} onChange={(e) => setOperationSlug(e.target.value)}>
          <option value="">— choose —</option>
          {operations.map((op) => (
            <option key={op.slug} value={op.slug}>
              {op.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Description" htmlFor="desc">
        <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} autoFocus />
      </Field>

      {draft.contentType === 'codeblock' && (
        <>
          <Field label="Language" htmlFor="lang" hint="Optional">
            <Input id="lang" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="bash" />
          </Field>
          <Field label="Content" htmlFor="content">
            <Textarea id="content" rows={6} value={content} onChange={(e) => setContent(e.target.value)} className="font-mono" />
          </Field>
        </>
      )}

      {draft.contentType === 'none' && (
        <Field label="Note" htmlFor="note">
          <Textarea id="note" rows={5} value={content} onChange={(e) => setContent(e.target.value)} />
        </Field>
      )}

      <Field label="Tags">
        <TagPicker tags={tags} selectedIds={tagIds} onChange={setTagIds} emptyHint="No tags in this operation." />
      </Field>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} loading={submitting} disabled={!operationSlug}>
          Add evidence
        </Button>
      </div>
    </div>
  );
}
