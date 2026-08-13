import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Spinner,
  Textarea,
  useToast,
} from '@reporter/ui';
import { useCreateFinding, useFindings } from '../api/hooks.js';

export function FindingsPage() {
  const { slug = '' } = useParams();
  const { data: findings, isLoading, isError, refetch } = useFindings(slug);
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text">Findings</h2>
        <Button onClick={() => setCreating(true)}>New finding</Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <ErrorState description="Couldn’t load findings." onRetry={() => refetch()} />
      ) : !findings || findings.length === 0 ? (
        <EmptyState
          title="No findings yet"
          description="Group related evidence into a finding to build your report."
          action={<Button onClick={() => setCreating(true)}>New finding</Button>}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {findings.map((f) => (
            <Link
              key={f.uuid}
              to={`/operations/${slug}/findings/${f.uuid}`}
              className="flex items-center justify-between rounded-card border border-border bg-surface p-3 hover:border-accent/50"
            >
              <div>
                <p className="font-medium text-text">{f.title}</p>
                <p className="text-xs text-muted">
                  {f.category ?? 'Uncategorized'} · {f.numEvidence} evidence
                </p>
              </div>
              {f.readyToReport && <Badge tone="success">Ready to report</Badge>}
            </Link>
          ))}
        </div>
      )}

      <CreateFindingModal slug={slug} open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function CreateFindingModal({ slug, open, onClose }: { slug: string; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const create = useCreateFinding(slug);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');

  async function submit() {
    try {
      await create.mutateAsync({ title, description, category: category || null });
      toast.success('Finding created');
      setTitle('');
      setDescription('');
      setCategory('');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create finding');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New finding"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={!title}>
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Title" htmlFor="f-title">
          <Input id="f-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Category" htmlFor="f-cat" hint="Optional">
          <Input id="f-cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Vulnerability" />
        </Field>
        <Field label="Description" htmlFor="f-desc">
          <Textarea id="f-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
        </Field>
      </div>
    </Modal>
  );
}
