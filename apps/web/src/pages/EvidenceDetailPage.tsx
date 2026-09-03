import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  MarkdownField,
  MarkdownPreview,
  Spinner,
  TagChip,
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
import { EvidenceBody } from '../components/evidence/EvidenceBody.js';
import { EvidenceMeta } from '../components/evidence/EvidenceMeta.js';
import { EvidenceEntryRow } from '../components/evidence/EvidenceEntryRow.js';
import { CreateEvidenceModal } from '../components/evidence/CreateEvidenceModal.js';
import { ReparentEvidenceModal } from '../components/evidence/ReparentEvidenceModal.js';
import {
  DeleteEvidenceDialog,
  type DeleteEvidenceMode,
} from '../components/evidence/DeleteEvidenceDialog.js';
import { LinkedGoalsSection } from '../components/goals/LinkedGoalsSection.js';
import { AccordionSection } from '../components/common/AccordionSection.js';

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

  // Accordion + deliberate-edit state. Details/Linked-goals collapse to a
  // read-only view; expanding Details seeds an edit draft that only persists on an
  // explicit Save (collapsing/Cancel discards).
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [draft, setDraft] = useState<EvidenceForm>({ title: '', description: '', tagIds: [] });
  const [savingDetails, setSavingDetails] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // `attach` opens the picker to make this top-level item a comment on another;
  // `move` opens it to move this comment under a different parent. Only one at a time.
  const [reparenting, setReparenting] = useState<null | 'attach' | 'move'>(null);
  const [linkBusy, setLinkBusy] = useState(false);

  function openDetails(open: boolean) {
    if (open && evidence) {
      setDraft({
        title: evidence.title,
        description: evidence.description,
        tagIds: evidence.tags.map((t) => t.id),
      });
    }
    setDetailsOpen(open);
  }

  async function saveDetails() {
    if (!draft.title.trim()) {
      toast.error('A title is required.');
      return;
    }
    setSavingDetails(true);
    try {
      await update.mutateAsync({
        uuid,
        patch: {
          title: draft.title.trim(),
          description: draft.description,
          tagIds: draft.tagIds,
        },
      });
      toast.success('Details saved');
      setDetailsOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save details');
    } finally {
      setSavingDetails(false);
    }
  }

  if (isLoading) return <Spinner size={26} />;
  if (isError)
    return <ErrorState description="Couldn’t load this evidence." onRetry={() => refetch()} />;
  if (!evidence) return <p className="text-danger">Evidence not found.</p>;

  // A comment is one level deep, so only top-level evidence hosts a comment thread.
  const isComment = evidence.parentEvidenceUuid !== null;
  const commentList = comments.data ?? [];

  // Attach (parent uuid) / move (new parent uuid) / detach (null) all funnel
  // through one PUT of `parentEvidenceUuid`.
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

      <div className="mt-3 min-w-0 space-y-4">
        {/* Meta header (type, capturer, when, last-edited, tags) — above content. */}
        <Card className="p-4">
          <EvidenceMeta evidence={evidence} />
        </Card>

        {/* Details: collapsed = read-only; expand = deliberate edit. */}
        <AccordionSection
          title="Details"
          open={detailsOpen}
          onOpenChange={openDetails}
          summary={
            <div className="space-y-2">
              <p className="text-base font-semibold text-text">
                {evidence.title || <span className="text-muted">Untitled</span>}
              </p>
              {evidence.description.trim() ? (
                <MarkdownPreview source={evidence.description} />
              ) : (
                <p className="text-sm text-muted">No description.</p>
              )}
              {evidence.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {evidence.tags.map((t) => (
                    <TagChip key={t.id} name={t.name} colorName={t.colorName} />
                  ))}
                </div>
              )}
            </div>
          }
        >
          <div className="space-y-4">
            <Field
              label="Title"
              htmlFor="d-title"
              required
              error={!draft.title.trim() ? 'A title is required.' : undefined}
            >
              <Input
                id="d-title"
                value={draft.title}
                onChange={(e) => setDraft((f) => ({ ...f, title: e.target.value }))}
                invalid={!draft.title.trim()}
                disabled={!canWrite}
                title={canWrite ? undefined : READ_ONLY_TITLE}
              />
            </Field>
            <Field label="Description" htmlFor="d-desc" hint="Optional">
              <MarkdownField
                id="d-desc"
                rows={3}
                value={draft.description}
                onChange={(v) => setDraft((f) => ({ ...f, description: v }))}
                disabled={!canWrite}
                title={canWrite ? undefined : READ_ONLY_TITLE}
              />
            </Field>
            <Field label="Tags">
              <TagPicker
                tags={tags ?? []}
                selectedIds={draft.tagIds}
                onChange={(tagIds) => setDraft((f) => ({ ...f, tagIds }))}
                onCreateTag={onCreateTag}
                disabled={!canWrite}
                title={canWrite ? undefined : READ_ONLY_TITLE}
              />
            </Field>
            <div className="flex items-center justify-between gap-2">
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
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setDetailsOpen(false)} disabled={savingDetails}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => void saveDetails()}
                  loading={savingDetails}
                  disabled={!canWrite || !draft.title.trim()}
                  title={canWrite ? undefined : READ_ONLY_TITLE}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </AccordionSection>

        {/* Linked goals: collapsed = read-only list; expand = add/unlink. */}
        {!isComment && (
          <AccordionSection
            title="Linked goals"
            open={goalsOpen}
            onOpenChange={setGoalsOpen}
            summary={
              <LinkedGoalsSection slug={slug} kind="evidence" uuid={uuid} canWrite={false} bare />
            }
          >
            <LinkedGoalsSection slug={slug} kind="evidence" uuid={uuid} canWrite={canWrite} bare />
          </AccordionSection>
        )}

        {/* The evidence content — its own deliberate Edit → Save. */}
        <EvidenceBody slug={slug} evidence={evidence} canWrite={canWrite} />

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
                No comments yet. Add one to link related evidence or record an update on this item.
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
