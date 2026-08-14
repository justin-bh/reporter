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
import type { Engagement } from '@reporter/shared';
import { slugify } from '../lib/slugify.js';
import { useCreateEngagement, useEngagements, useToggleFavorite } from '../api/hooks.js';

const STATUS_TONE = { active: 'success', complete: 'info', archived: 'neutral' } as const;

export function EngagementsPage() {
  const { data: engagements, isLoading, isError, refetch } = useEngagements();
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text">Engagements</h1>
          <p className="text-sm text-muted">Engagements you can access.</p>
        </div>
        <Button onClick={() => setCreating(true)}>New engagement</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size={26} />
        </div>
      ) : isError ? (
        <ErrorState description="Couldn’t load your engagements." onRetry={() => refetch()} />
      ) : !engagements || engagements.length === 0 ? (
        <EmptyState
          title="No engagements yet"
          description="Create your first engagement to start collecting evidence."
          action={<Button onClick={() => setCreating(true)}>New engagement</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {engagements.map((eng) => (
            <EngagementCard key={eng.slug} eng={eng} />
          ))}
        </div>
      )}

      <CreateEngagementModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function EngagementCard({ eng }: { eng: Engagement }) {
  const toggle = useToggleFavorite(eng.slug);
  return (
    <Card className="flex flex-col gap-3 p-4 transition-colors hover:border-accent/50">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/engagements/${eng.slug}/evidence`}
          className="font-semibold text-text hover:text-accent"
        >
          {eng.name}
        </Link>
        <button
          aria-label={eng.favorite ? 'Unfavorite' : 'Favorite'}
          onClick={() => toggle.mutate(!eng.favorite)}
          className={eng.favorite ? 'text-warning' : 'text-muted hover:text-warning'}
        >
          {eng.favorite ? '★' : '☆'}
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted">
        <Badge tone={STATUS_TONE[eng.status]}>{eng.status}</Badge>
        <span>{eng.numEvidence ?? 0} evidence</span>
        <span>·</span>
        <span>{eng.numUsers ?? 0} members</span>
      </div>
    </Card>
  );
}

function CreateEngagementModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const create = useCreateEngagement();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  const effectiveSlug = slugTouched ? slug : slugify(name);

  async function submit() {
    try {
      await create.mutateAsync({ name, slug: effectiveSlug });
      toast.success('Engagement created');
      setName('');
      setSlug('');
      setSlugTouched(false);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create engagement');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New engagement"
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
        <Field label="Name" htmlFor="eng-name">
          <Input id="eng-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Slug" htmlFor="eng-slug" hint="Used in URLs. Lowercase, hyphenated.">
          <Input
            id="eng-slug"
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
