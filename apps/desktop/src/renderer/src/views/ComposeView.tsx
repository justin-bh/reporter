import { useEffect, useState } from 'react';
import {
  Button,
  EmptyState,
  Field,
  Input,
  Select,
  TagPicker,
  Textarea,
  useToast,
} from '@reporter/ui';
import type { CaptureDraft, EngagementLite, EvidenceLite, TagLite } from '../../../shared/types.js';

export function ComposeView({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<CaptureDraft | null | undefined>(undefined);
  const [engagements, setEngagements] = useState<EngagementLite[]>([]);
  const [engagementSlug, setEngagementSlug] = useState('');
  const [tags, setTags] = useState<TagLite[]>([]);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [evidenceOptions, setEvidenceOptions] = useState<EvidenceLite[]>([]);
  const [parentEvidenceUuid, setParentEvidenceUuid] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [language, setLanguage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const [d, settings, engs] = await Promise.all([
        window.reporter.getDraft(),
        window.reporter.getSettings(),
        window.reporter.listEngagements().catch(() => [] as EngagementLite[]),
      ]);
      setDraft(d);
      setContent(d?.content ?? '');
      setEngagements(engs);
      setEngagementSlug(settings.currentEngagementSlug ?? engs[0]?.slug ?? '');
    })();
  }, []);

  useEffect(() => {
    if (!engagementSlug) {
      setTags([]);
      setEvidenceOptions([]);
      return;
    }
    window.reporter
      .listTags(engagementSlug)
      .then(setTags)
      .catch(() => setTags([]));
    window.reporter
      .listEvidence(engagementSlug)
      .then(setEvidenceOptions)
      .catch(() => setEvidenceOptions([]));
    setTagIds([]);
    setParentEvidenceUuid('');
  }, [engagementSlug]);

  if (draft === undefined) return <p className="text-sm text-muted">Loading…</p>;

  if (draft === null) {
    return (
      <EmptyState
        title="Nothing to compose"
        description="Capture a screenshot or add a code block from the tray, then describe it here."
        action={
          <Button size="sm" onClick={() => window.reporter.captureArea()}>
            Capture area
          </Button>
        }
      />
    );
  }

  async function submit() {
    if (!engagementSlug) {
      toast.error('Choose an engagement first');
      return;
    }
    setSubmitting(true);
    try {
      await window.reporter.submitDraft({
        engagementSlug,
        description,
        tagIds,
        contentType: draft!.contentType,
        filePath: draft!.filePath,
        content: draft!.contentType === 'image' ? undefined : content,
        contentSubtype: draft!.contentType === 'codeblock' && language ? language : undefined,
        parentEvidenceUuid: parentEvidenceUuid || undefined,
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

      <Field label="Engagement" htmlFor="eng">
        <Select id="eng" value={engagementSlug} onChange={(e) => setEngagementSlug(e.target.value)}>
          <option value="">— choose —</option>
          {engagements.map((eng) => (
            <option key={eng.slug} value={eng.slug}>
              {eng.name} — {eng.status}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Description" htmlFor="desc">
        <Input
          id="desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          autoFocus
        />
      </Field>

      {draft.contentType === 'codeblock' && (
        <>
          <Field label="Language" htmlFor="lang" hint="Optional">
            <Input
              id="lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="bash"
            />
          </Field>
          <Field label="Content" htmlFor="content">
            <Textarea
              id="content"
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="font-mono"
            />
          </Field>
        </>
      )}

      {draft.contentType === 'none' && (
        <Field label="Note" htmlFor="note">
          <Textarea
            id="note"
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </Field>
      )}

      <Field label="Tags">
        <TagPicker
          tags={tags}
          selectedIds={tagIds}
          onChange={setTagIds}
          emptyHint="No tags in this engagement."
        />
      </Field>

      {evidenceOptions.length > 0 && (
        <Field
          label="Comment on"
          htmlFor="comment-on"
          hint="Optional — link this as a comment on recent evidence"
        >
          <Select
            id="comment-on"
            value={parentEvidenceUuid}
            onChange={(e) => setParentEvidenceUuid(e.target.value)}
          >
            <option value="">— none —</option>
            {evidenceOptions.map((ev) => (
              <option key={ev.uuid} value={ev.uuid}>
                {ev.description || `(${ev.contentType})`}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} loading={submitting} disabled={!engagementSlug}>
          Add evidence
        </Button>
      </div>
    </div>
  );
}
