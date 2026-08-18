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
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
} from '@reporter/ui';
import type { Engagement } from '@reporter/shared';
import { slugify } from '../lib/slugify.js';
import { formatDate, fromDateInput } from '../lib/format.js';
import { useCreateEngagement, useEngagements, useToggleFavorite } from '../api/hooks.js';

const STATUS_TONE = { active: 'success', complete: 'info', archived: 'neutral' } as const;

type EngagementsView = 'card' | 'table';
const VIEW_STORAGE_KEY = 'reporter.engagementsView';

/** Persist the card/table choice across visits so the preference sticks. */
function usePersistedView(): [EngagementsView, (v: EngagementsView) => void] {
  const [view, setView] = useState<EngagementsView>(() => {
    try {
      return localStorage.getItem(VIEW_STORAGE_KEY) === 'table' ? 'table' : 'card';
    } catch {
      return 'card';
    }
  });
  const update = (v: EngagementsView) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, v);
    } catch {
      /* storage unavailable — keep the in-memory choice */
    }
  };
  return [view, update];
}

export function EngagementsPage() {
  const { data: engagements, isLoading, isError, refetch } = useEngagements();
  const [creating, setCreating] = useState(false);
  const [view, setView] = usePersistedView();

  const hasEngagements = Boolean(engagements && engagements.length > 0);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">Engagements</h1>
          <p className="text-sm text-muted">Engagements you can access.</p>
        </div>
        <div className="flex items-center gap-2">
          {hasEngagements && <ViewToggle view={view} onChange={setView} />}
          <Button onClick={() => setCreating(true)}>New engagement</Button>
        </div>
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
      ) : view === 'table' ? (
        <EngagementsTable engagements={engagements} />
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

function ViewToggle({
  view,
  onChange,
}: {
  view: EngagementsView;
  onChange: (v: EngagementsView) => void;
}) {
  const options: { value: EngagementsView; label: string }[] = [
    { value: 'card', label: 'Cards' },
    { value: 'table', label: 'Table' },
  ];
  return (
    <div className="inline-flex rounded-input border border-border p-0.5" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={view === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-input px-2.5 py-1 text-sm font-medium transition-colors ${
            view === o.value ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FavoriteButton({ eng }: { eng: Engagement }) {
  const toggle = useToggleFavorite(eng.slug);
  return (
    <button
      aria-label={eng.favorite ? 'Unfavorite' : 'Favorite'}
      onClick={() => toggle.mutate(!eng.favorite)}
      className={eng.favorite ? 'text-warning' : 'text-muted hover:text-warning'}
    >
      {eng.favorite ? '★' : '☆'}
    </button>
  );
}

function EngagementCard({ eng }: { eng: Engagement }) {
  const findings = eng.numFindings ?? 0;
  return (
    <Card className="flex flex-col gap-3 p-4 transition-colors hover:border-accent/50">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/engagements/${eng.slug}/evidence`}
          className="font-semibold text-text hover:text-accent"
        >
          {eng.name}
        </Link>
        <FavoriteButton eng={eng} />
      </div>
      <div className="flex items-center gap-2 text-xs text-muted">
        <Badge tone={STATUS_TONE[eng.status]}>{eng.status}</Badge>
        <span>{eng.numEvidence ?? 0} evidence</span>
        {findings > 0 && (
          <>
            <span>·</span>
            <span>
              {findings} {findings === 1 ? 'finding' : 'findings'}
            </span>
          </>
        )}
        <span>·</span>
        <span>{eng.numUsers ?? 0} members</span>
      </div>
      <div className="text-xs text-muted">
        Started {formatDate(eng.startedAt)}
        {eng.actualEndAt
          ? ` · ended ${formatDate(eng.actualEndAt)}`
          : eng.projectedEndAt
            ? ` · due ${formatDate(eng.projectedEndAt)}`
            : ''}
      </div>
    </Card>
  );
}

function EngagementsTable({ engagements }: { engagements: Engagement[] }) {
  return (
    <Table>
      <Thead>
        <Tr>
          <Th />
          <Th>Name</Th>
          <Th>Status</Th>
          <Th className="text-right">Evidence</Th>
          <Th className="text-right">Findings</Th>
          <Th className="text-right">Members</Th>
        </Tr>
      </Thead>
      <Tbody>
        {engagements.map((eng) => {
          const findings = eng.numFindings ?? 0;
          return (
            <Tr key={eng.slug}>
              <Td className="w-8 text-center">
                <FavoriteButton eng={eng} />
              </Td>
              <Td>
                <Link
                  to={`/engagements/${eng.slug}/evidence`}
                  className="font-medium text-text hover:text-accent"
                >
                  {eng.name}
                </Link>
              </Td>
              <Td>
                <Badge tone={STATUS_TONE[eng.status]}>{eng.status}</Badge>
              </Td>
              <Td className="text-right tabular-nums">{eng.numEvidence ?? 0}</Td>
              <Td className="text-right tabular-nums text-muted">{findings > 0 ? findings : ''}</Td>
              <Td className="text-right tabular-nums">{eng.numUsers ?? 0}</Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
}

function CreateEngagementModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const create = useCreateEngagement();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [projectedEndAt, setProjectedEndAt] = useState('');

  const effectiveSlug = slugTouched ? slug : slugify(name);

  async function submit() {
    try {
      await create.mutateAsync({
        name,
        slug: effectiveSlug,
        projectedEndAt: fromDateInput(projectedEndAt),
      });
      toast.success('Engagement created');
      setName('');
      setSlug('');
      setSlugTouched(false);
      setProjectedEndAt('');
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
        <Field
          label="Projected end date"
          htmlFor="eng-projected-end"
          hint="Optional target end date. The start date is set to today."
        >
          <Input
            id="eng-projected-end"
            type="date"
            value={projectedEndAt}
            onChange={(e) => setProjectedEndAt(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
