import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, ErrorState, Field, Input, Spinner, TagPicker, useToast } from '@reporter/ui';
import {
  useDeleteEvidence,
  useEvidence,
  useEvidenceComments,
  useTags,
  useUpdateEvidence,
} from '../api/hooks.js';
import { EvidenceContent } from '../components/evidence/EvidenceContent.js';
import { EvidenceMeta } from '../components/evidence/EvidenceMeta.js';
import { EvidenceEntryRow } from '../components/evidence/EvidenceEntryRow.js';
import { CreateEvidenceModal } from '../components/evidence/CreateEvidenceModal.js';
import {
  DeleteEvidenceDialog,
  type DeleteEvidenceMode,
} from '../components/evidence/DeleteEvidenceDialog.js';

export function EvidenceDetailPage() {
  const { slug = '', uuid = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: evidence, isLoading, isError, refetch } = useEvidence(slug, uuid);
  const { data: tags } = useTags(slug);
  const comments = useEvidenceComments(slug, uuid);
  const update = useUpdateEvidence(slug);
  const del = useDeleteEvidence(slug);

  const [description, setDescription] = useState('');
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (evidence) {
      setDescription(evidence.description);
      setTagIds(evidence.tags.map((t) => t.id));
    }
  }, [evidence]);

  if (isLoading) return <Spinner size={26} />;
  if (isError)
    return <ErrorState description="Couldn’t load this evidence." onRetry={() => refetch()} />;
  if (!evidence) return <p className="text-danger">Evidence not found.</p>;

  // A comment is one level deep, so only top-level evidence hosts a comment thread.
  const isComment = evidence.parentEvidenceUuid !== null;
  const commentList = comments.data ?? [];

  async function save() {
    try {
      await update.mutateAsync({ uuid, patch: { description, tagIds } });
      toast.success('Evidence updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
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
        <div className="mt-3 rounded-card border border-border bg-surface-2 px-4 py-2 text-sm">
          <Link
            to={`/engagements/${slug}/evidence/${evidence.parentEvidenceUuid}`}
            className="text-accent hover:underline"
          >
            ↳ This is a comment — view the evidence it’s linked to
          </Link>
        </div>
      )}

      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <EvidenceContent evidence={evidence} slug={slug} />

          {!isComment && (
            <Card className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text">
                  Comments <span className="font-normal text-muted">(Linked Evidence)</span>
                </h3>
                <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
                  Add comment
                </Button>
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
            <h3 className="text-sm font-semibold text-text">Edit</h3>
            <Field label="Description" htmlFor="d-desc">
              <Input
                id="d-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <Field label="Tags">
              <TagPicker tags={tags ?? []} selectedIds={tagIds} onChange={setTagIds} />
            </Field>
            <div className="flex justify-between">
              <Button
                variant="danger"
                size="sm"
                onClick={() => setDeleting(true)}
                loading={del.isPending}
              >
                Delete
              </Button>
              <Button size="sm" onClick={save} loading={update.isPending}>
                Save changes
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <CreateEvidenceModal
        slug={slug}
        open={adding}
        onClose={() => setAdding(false)}
        parentEvidenceUuid={evidence.uuid}
        title="Add comment"
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
