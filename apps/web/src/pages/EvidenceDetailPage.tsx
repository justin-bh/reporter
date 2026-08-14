import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Spinner,
  TagPicker,
  useConfirm,
  useToast,
} from '@reporter/ui';
import { useDeleteEvidence, useEvidence, useTags, useUpdateEvidence } from '../api/hooks.js';
import { EvidenceContent } from '../components/evidence/EvidenceContent.js';
import { EvidenceMeta } from '../components/evidence/EvidenceMeta.js';

export function EvidenceDetailPage() {
  const { slug = '', uuid = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: evidence, isLoading, isError, refetch } = useEvidence(slug, uuid);
  const { data: tags } = useTags(slug);
  const update = useUpdateEvidence(slug);
  const del = useDeleteEvidence(slug);
  const confirmDialog = useConfirm();

  const [description, setDescription] = useState('');
  const [tagIds, setTagIds] = useState<number[]>([]);

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

  async function save() {
    try {
      await update.mutateAsync({ uuid, patch: { description, tagIds } });
      toast.success('Evidence updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function remove() {
    const ok = await confirmDialog({
      title: 'Delete evidence',
      message: 'Delete this evidence? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await del.mutateAsync(uuid);
      toast.success('Evidence deleted');
      navigate(`/engagements/${slug}/evidence`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div>
      <Link to={`/engagements/${slug}/evidence`} className="text-sm text-muted hover:text-text">
        ← Back to timeline
      </Link>

      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <EvidenceContent evidence={evidence} slug={slug} />
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
              <Button variant="danger" size="sm" onClick={remove} loading={del.isPending}>
                Delete
              </Button>
              <Button size="sm" onClick={save} loading={update.isPending}>
                Save changes
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
