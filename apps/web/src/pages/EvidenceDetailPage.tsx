import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  MarkdownField,
  Spinner,
  TagPicker,
  useConfirm,
  useToast,
} from '@reporter/ui';
import { defaultTagColorFor } from '@reporter/shared';
import {
  useCreateTag,
  useDeleteEvidence,
  useEvidence,
  useEvidenceComments,
  useTags,
  useUpdateEvidence,
} from '../api/hooks.js';
import { READ_ONLY_TITLE, useEngagementPermissions } from '../lib/permissions.js';
import { useAutosave } from '../hooks/useAutosave.js';
import { SaveStatusIndicator } from '../components/SaveStatusIndicator.js';
import { EvidenceContent } from '../components/evidence/EvidenceContent.js';
import { EvidenceMeta } from '../components/evidence/EvidenceMeta.js';
import { EvidenceEntryRow } from '../components/evidence/EvidenceEntryRow.js';
import { CreateEvidenceModal } from '../components/evidence/CreateEvidenceModal.js';
import { ReparentEvidenceModal } from '../components/evidence/ReparentEvidenceModal.js';
import {
  DeleteEvidenceDialog,
  type DeleteEvidenceMode,
} from '../components/evidence/DeleteEvidenceDialog.js';
import { LinkedGoalsSection } from '../components/goals/LinkedGoalsSection.js';

interface EvidenceForm {
  title: string;
  description: string;
  tagIds: number[];
}

export function EvidenceDetailPage() {
  const { slug = '', uuid = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { data: evidence, isLoading, isError, refetch } = useEvidence(slug, uuid);
  const { canWrite } = useEngagementPermissions(slug);
  const { data: tags } = useTags(slug);
  const comments = useEvidenceComments(slug, uuid);
  const update = useUpdateEvidence(slug);
  const del = useDeleteEvidence(slug);
  const createTag = useCreateTag(slug);

  // Inline "+ New tag" in the picker: create a tag with a name-derived color and
  // return its id so the picker can select it. Writers only; read-only omits it.
  const onCreateTag = canWrite
    ? async (tagName: string) => {
        try {
          const t = await createTag.mutateAsync({
            name: tagName,
            colorName: defaultTagColorFor(tagName),
          });
          return t.id;
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Could not create tag');
          throw err;
        }
      }
    : undefined;

  const [form, setForm] = useState<EvidenceForm>({ title: '', description: '', tagIds: [] });
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // `attach` opens the picker to make this top-level item a comment on another;
  // `move` opens it to move this comment under a different parent. Only one at a time.
  const [reparenting, setReparenting] = useState<null | 'attach' | 'move'>(null);
  // A dedicated in-flight flag for linking actions so we can spin the specific
  // trigger without coupling to the shared autosave's `update.isPending`.
  const [linkBusy, setLinkBusy] = useState(false);

  // Seed the form once per uuid, not on every cache change — starring or a
  // returned mutation value replaces the cached `evidence` object, and reseeding
  // then would clobber an in-progress edit (mirrors FindingDetailPage's guard).
  const seededUuid = useRef<string | null>(null);
  // Baseline is the last-saved server value the autosave compares against. It's
  // undefined until the record loads, then tracks each accepted edit.
  const [baseline, setBaseline] = useState<EvidenceForm | undefined>(undefined);
  useEffect(() => {
    if (evidence && seededUuid.current !== evidence.uuid) {
      seededUuid.current = evidence.uuid;
      const seeded: EvidenceForm = {
        title: evidence.title,
        description: evidence.description,
        tagIds: evidence.tags.map((t) => t.id),
      };
      setForm(seeded);
      setBaseline(seeded);
    }
  }, [evidence]);

  const { status, flush } = useAutosave<EvidenceForm>({
    value: form,
    baseline,
    isValid: (v) => v.title.trim().length > 0,
    save: async (v) => {
      const patch = {
        title: v.title.trim(),
        description: v.description,
        tagIds: v.tagIds,
      };
      await update.mutateAsync({ uuid, patch });
      // Advance the baseline so the form is considered clean at what we just saved.
      setBaseline(v);
    },
  });

  const titleInvalid = form.title.trim().length === 0;

  if (isLoading) return <Spinner size={26} />;
  if (isError)
    return <ErrorState description="Couldn’t load this evidence." onRetry={() => refetch()} />;
  if (!evidence) return <p className="text-danger">Evidence not found.</p>;

  // A comment is one level deep, so only top-level evidence hosts a comment thread.
  const isComment = evidence.parentEvidenceUuid !== null;
  const commentList = comments.data ?? [];

  // Attach (parent uuid) / move (new parent uuid) / detach (null) all funnel
  // through one PUT of `parentEvidenceUuid`. The shared hook already refreshes
  // the timeline and this evidence's detail; here we additionally invalidate the
  // OLD parent (losing a comment) and the NEW parent (gaining one) so their
  // comment lists + counts update, since only this component knows those uuids.
  async function reparent(target: string | null) {
    const oldParent = evidence?.parentEvidenceUuid ?? null;
    setLinkBusy(true);
    try {
      await update.mutateAsync({ uuid, patch: { parentEvidenceUuid: target } });
      for (const p of [oldParent, target]) {
        if (p) {
          qc.invalidateQueries({ queryKey: ['evidence-comments', slug, p] });
          qc.invalidateQueries({ queryKey: ['evidence', slug, p] });
        }
      }
      // This item's own thread reflects the change too (attaching hides it,
      // detaching restores it as a standalone thread host).
      qc.invalidateQueries({ queryKey: ['evidence-comments', slug, uuid] });
      setReparenting(null);
      toast.success(
        target === null
          ? 'Detached — now standalone evidence'
          : oldParent
            ? 'Moved to another evidence'
            : 'Now a comment on the selected evidence',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update linking');
    } finally {
      setLinkBusy(false);
    }
  }

  async function detach() {
    const ok = await confirm({
      title: 'Detach this comment?',
      message:
        'This comment will become a standalone, top-level piece of evidence. Its own comments (if any) stay attached to it.',
      confirmLabel: 'Detach',
    });
    if (ok) await reparent(null);
  }

  async function remove(mode: DeleteEvidenceMode) {
    try {
      await del.mutateAsync({ uuid, comments: mode });
      toast.success('Evidence deleted');
      navigate(`/engagements/${slug}/evidence`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <Link to={`/engagements/${slug}/evidence`} className="text-sm text-muted hover:text-text">
        ← Back to timeline
      </Link>

      {isComment && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface-2 px-4 py-2 text-sm">
          <Link
            to={`/engagements/${slug}/evidence/${evidence.parentEvidenceUuid}`}
            className="text-accent hover:underline"
          >
            ↳ This is a comment — view the evidence it’s linked to
          </Link>
          <div className="flex flex-none gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setReparenting('move')}
              loading={linkBusy && reparenting === 'move'}
              disabled={!canWrite || linkBusy}
              title={canWrite ? undefined : READ_ONLY_TITLE}
            >
              Move to another evidence…
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void detach()}
              loading={linkBusy && reparenting === null}
              disabled={!canWrite || linkBusy}
              title={canWrite ? undefined : READ_ONLY_TITLE}
            >
              Detach (make standalone)
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          {/* Caption off here: the title is shown once, in the editable Title
              field above the description in the Edit card. */}
          <EvidenceContent evidence={evidence} slug={slug} showCaption={false} />

          {!isComment && (
            <Card className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-text">
                  Comments <span className="font-normal text-muted">(Linked Evidence)</span>
                </h3>
                <div className="flex flex-none gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setReparenting('attach')}
                    loading={linkBusy && reparenting === 'attach'}
                    disabled={!canWrite || linkBusy || evidence.commentCount > 0}
                    title={
                      !canWrite
                        ? READ_ONLY_TITLE
                        : evidence.commentCount > 0
                          ? `Detach its ${evidence.commentCount} comment(s) first — comments are one level deep.`
                          : undefined
                    }
                  >
                    Make a comment on…
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setAdding(true)}
                    disabled={!canWrite}
                    title={canWrite ? undefined : READ_ONLY_TITLE}
                  >
                    Add comment
                  </Button>
                </div>
              </div>
              {comments.isLoading ? (
                <Spinner />
              ) : commentList.length === 0 ? (
                <p className="text-sm text-muted">
                  No comments yet. Add one to link related evidence or record an update on this
                  item.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {commentList.map((c) => (
                    <EvidenceEntryRow key={c.uuid} slug={slug} ev={c} />
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <EvidenceMeta evidence={evidence} />
          </Card>

          <Card className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-text">Edit</h3>
              {canWrite && <SaveStatusIndicator status={status} />}
            </div>
            <Field
              label="Title"
              htmlFor="d-title"
              required
              error={canWrite && titleInvalid ? 'A title is required.' : undefined}
            >
              <Input
                id="d-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                onBlur={() => void flush()}
                invalid={canWrite && titleInvalid}
                disabled={!canWrite}
                title={canWrite ? undefined : READ_ONLY_TITLE}
              />
            </Field>
            <Field label="Description" htmlFor="d-desc" hint="Optional">
              <MarkdownField
                id="d-desc"
                rows={3}
                value={form.description}
                onChange={(v) => setForm((f) => ({ ...f, description: v }))}
                onBlur={() => void flush()}
                disabled={!canWrite}
                title={canWrite ? undefined : READ_ONLY_TITLE}
              />
            </Field>
            <Field label="Tags">
              <TagPicker
                tags={tags ?? []}
                selectedIds={form.tagIds}
                onChange={(tagIds) => setForm((f) => ({ ...f, tagIds }))}
                onCreateTag={onCreateTag}
                disabled={!canWrite}
                title={canWrite ? undefined : READ_ONLY_TITLE}
              />
            </Field>
            <div className="flex justify-between">
              <Button
                variant="danger"
                size="sm"
                onClick={() => setDeleting(true)}
                loading={del.isPending}
                disabled={!canWrite}
                title={canWrite ? undefined : READ_ONLY_TITLE}
              >
                Delete
              </Button>
            </div>
          </Card>

          {!isComment && (
            <LinkedGoalsSection slug={slug} kind="evidence" uuid={uuid} canWrite={canWrite} />
          )}
        </div>
      </div>

      <CreateEvidenceModal
        slug={slug}
        open={adding}
        onClose={() => setAdding(false)}
        parentEvidenceUuid={evidence.uuid}
        title="Add comment"
      />
      <ReparentEvidenceModal
        slug={slug}
        open={reparenting !== null}
        currentUuid={uuid}
        title={reparenting === 'move' ? 'Move to…' : 'Make a comment on…'}
        confirmLabel={reparenting === 'move' ? 'Move here' : 'Make a comment'}
        busy={linkBusy}
        onPick={(target) => void reparent(target)}
        onClose={() => setReparenting(null)}
      />
      <DeleteEvidenceDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        commentCount={evidence.commentCount}
        pending={del.isPending}
        onConfirm={remove}
      />
    </div>
  );
}
