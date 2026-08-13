import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Spinner,
  useToast,
} from '@reporter/ui';
import type { Operation } from '@reporter/shared';
import { slugify } from '../lib/slugify.js';
import { useCreateOperation, useOperations, useToggleFavorite } from '../api/hooks.js';

const STATUS_TONE = { active: 'success', complete: 'info', archived: 'neutral' } as const;

export function OperationsPage() {
  const { data: operations, isLoading, isError, refetch } = useOperations();
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text">Operations</h1>
          <p className="text-sm text-muted">Operations you can access.</p>
        </div>
        <Button onClick={() => setCreating(true)}>New operation</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size={26} />
        </div>
      ) : isError ? (
        <ErrorState description="Couldn’t load your operations." onRetry={() => refetch()} />
      ) : !operations || operations.length === 0 ? (
        <EmptyState
          title="No operations yet"
          description="Create your first operation to start collecting evidence."
          action={<Button onClick={() => setCreating(true)}>New operation</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {operations.map((op) => (
            <OperationCard key={op.slug} op={op} />
          ))}
        </div>
      )}

      <CreateOperationModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function OperationCard({ op }: { op: Operation }) {
  const toggle = useToggleFavorite(op.slug);
  return (
    <Card className="flex flex-col gap-3 p-4 transition-colors hover:border-accent/50">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/operations/${op.slug}/evidence`} className="font-semibold text-text hover:text-accent">
          {op.name}
        </Link>
        <button
          aria-label={op.favorite ? 'Unfavorite' : 'Favorite'}
          onClick={() => toggle.mutate(!op.favorite)}
          className={op.favorite ? 'text-warning' : 'text-muted hover:text-warning'}
        >
          {op.favorite ? '★' : '☆'}
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted">
        <Badge tone={STATUS_TONE[op.status]}>{op.status}</Badge>
        <span>{op.numEvidence ?? 0} evidence</span>
        <span>·</span>
        <span>{op.numUsers ?? 0} members</span>
      </div>
    </Card>
  );
}

function CreateOperationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const create = useCreateOperation();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  const effectiveSlug = slugTouched ? slug : slugify(name);

  async function submit() {
    try {
      await create.mutateAsync({ name, slug: effectiveSlug });
      toast.success('Operation created');
      setName('');
      setSlug('');
      setSlugTouched(false);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create operation');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New operation"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={!name || !effectiveSlug}>
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" htmlFor="op-name">
          <Input id="op-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Slug" htmlFor="op-slug" hint="Used in URLs. Lowercase, hyphenated.">
          <Input
            id="op-slug"
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}
