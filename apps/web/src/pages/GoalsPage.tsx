import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  MarkdownField,
  Modal,
  Spinner,
  Textarea,
  useConfirm,
  useToast,
} from '@reporter/ui';
import {
  GOAL_STATUS_LABELS,
  type Activity,
  type Goal,
  type Target,
} from '@reporter/shared';
import {
  useCreateActivity,
  useCreateGoal,
  useCreateTarget,
  useDeleteActivity,
  useDeleteGoal,
  useDeleteTarget,
  useEngagement,
  useGoals,
  useLinkGoalEvidence,
  useUpdateActivity,
  useUpdateEngagement,
  useUpdateGoal,
  useUpdateTarget,
} from '../api/hooks.js';
import { ADMIN_ONLY_TITLE, READ_ONLY_TITLE, useEngagementPermissions } from '../lib/permissions.js';
import { useAutosave } from '../hooks/useAutosave.js';
import { SaveStatusIndicator } from '../components/SaveStatusIndicator.js';
import { ProgressBar } from '../components/goals/ProgressBar.js';
import { GoalStatusControl } from '../components/goals/GoalStatusControl.js';
import { ImportProposalModal } from '../components/goals/ImportProposalModal.js';
import { FindingPickerModal } from '../components/goals/FindingPickerModal.js';
import { EvidencePickerModal } from '../components/findings/EvidencePickerModal.js';

export function GoalsPage() {
  const { slug = '' } = useParams();
  const { canWrite, canAdmin } = useEngagementPermissions(slug);
  const { data: tree, isLoading, isError, refetch } = useGoals(slug);
  const [importOpen, setImportOpen] = useState(false);
  const [addTargetOpen, setAddTargetOpen] = useState(false);

  const hasTargets = (tree?.targets.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-text">Goals</h2>
          <p className="text-sm text-muted">
            Track scope as Target → Activity → Goal. Progress rolls up from each goal’s status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setImportOpen(true)}
            disabled={!canWrite}
            title={canWrite ? undefined : READ_ONLY_TITLE}
          >
            Import proposal
          </Button>
          <Button
            onClick={() => setAddTargetOpen(true)}
            disabled={!canWrite}
            title={canWrite ? undefined : READ_ONLY_TITLE}
          >
            Add target
          </Button>
        </div>
      </div>

      <ObjectivesNarrative slug={slug} canEdit={canAdmin} />

      {tree && tree.progress.total > 0 && (
        <Card className="space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-text">Progress</h3>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="success">{tree.progress.complete} complete</Badge>
              <Badge tone="accent">{tree.progress.inProgress} in progress</Badge>
              <Badge tone="neutral">{tree.progress.notStarted} not started</Badge>
              {tree.progress.notApplicable > 0 && (
                <Badge tone="neutral">{tree.progress.notApplicable} N/A</Badge>
              )}
            </div>
          </div>
          <ProgressBar progress={tree.progress} showLabel />
        </Card>
      )}

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <ErrorState description="Couldn’t load goals." onRetry={() => refetch()} />
      ) : !hasTargets ? (
        <EmptyState
          title="No targets yet"
          description="Import a proposal to build the goals tree automatically, or add a target to start manually."
          action={
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setImportOpen(true)}
                disabled={!canWrite}
                title={canWrite ? undefined : READ_ONLY_TITLE}
              >
                Import proposal
              </Button>
              <Button
                onClick={() => setAddTargetOpen(true)}
                disabled={!canWrite}
                title={canWrite ? undefined : READ_ONLY_TITLE}
              >
                Add target
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-3">
          {(tree?.targets ?? []).map((target) => (
            <TargetCard key={target.id} slug={slug} target={target} canWrite={canWrite} />
          ))}
        </div>
      )}

      <ImportProposalModal slug={slug} open={importOpen} onClose={() => setImportOpen(false)} />
      <TargetModal
        slug={slug}
        open={addTargetOpen}
        onClose={() => setAddTargetOpen(false)}
        mode="create"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Objectives narrative — autosaved to the engagement.
// ---------------------------------------------------------------------------

// The objectives narrative lives on the engagement and saves via the engagement
// update endpoint, which requires the engagement-admin role — so it gates on
// `canEdit` (admin), unlike the goal tree above (write).
function ObjectivesNarrative({ slug, canEdit }: { slug: string; canEdit: boolean }) {
  const { data: eng } = useEngagement(slug);
  const update = useUpdateEngagement(slug);

  const seededSlug = useRef<string | null>(null);
  const [value, setValue] = useState('');
  const [baseline, setBaseline] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (eng && seededSlug.current !== eng.slug) {
      seededSlug.current = eng.slug;
      const seeded = eng.objectivesNarrative ?? '';
      setValue(seeded);
      setBaseline(seeded);
    }
  }, [eng]);

  const { status, flush } = useAutosave<string>({
    value,
    baseline,
    isValid: () => canEdit,
    save: async (v) => {
      await update.mutateAsync({ objectivesNarrative: v.trim() === '' ? null : v });
      setBaseline(v);
    },
  });

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text">Objectives</h3>
          <p className="mt-0.5 text-xs text-muted">
            A short narrative of the engagement’s objectives (shown in the report’s scope coverage).
          </p>
        </div>
        {canEdit && <SaveStatusIndicator status={status} />}
      </div>
      <MarkdownField
        rows={4}
        value={value}
        onChange={(v) => setValue(v)}
        onBlur={() => void flush()}
        disabled={!canEdit}
        title={canEdit ? undefined : ADMIN_ONLY_TITLE}
        placeholder="Describe the objectives / areas of interest for this engagement…"
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Target card
// ---------------------------------------------------------------------------

function TargetCard({
  slug,
  target,
  canWrite,
}: {
  slug: string;
  target: Target;
  canWrite: boolean;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const del = useDeleteTarget(slug);
  const [editing, setEditing] = useState(false);
  const [addActivity, setAddActivity] = useState(false);

  async function remove() {
    const ok = await confirm({
      title: 'Delete target',
      message: `Delete “${target.name}” and all of its activities and goals? This can’t be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await del.mutateAsync(target.id);
      toast.success('Target deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-text">{target.name}</h3>
          {target.description && (
            <p className="mt-0.5 text-sm text-muted">{target.description}</p>
          )}
        </div>
        {canWrite && (
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <button
              type="button"
              onClick={remove}
              aria-label={`Delete target ${target.name}`}
              title="Delete target"
              className="px-1.5 text-muted hover:text-danger"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {target.activities.length === 0 ? (
          <p className="text-sm text-muted">No activities yet.</p>
        ) : (
          target.activities.map((activity) => (
            <ActivityBlock
              key={activity.id}
              slug={slug}
              targetId={target.id}
              activity={activity}
              canWrite={canWrite}
            />
          ))
        )}
      </div>

      {canWrite && (
        <Button size="sm" variant="secondary" onClick={() => setAddActivity(true)}>
          Add activity
        </Button>
      )}

      <TargetModal
        slug={slug}
        open={editing}
        onClose={() => setEditing(false)}
        mode="edit"
        target={target}
      />
      <ActivityModal
        slug={slug}
        targetId={target.id}
        open={addActivity}
        onClose={() => setAddActivity(false)}
        mode="create"
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Activity block
// ---------------------------------------------------------------------------

function ActivityBlock({
  slug,
  targetId,
  activity,
  canWrite,
}: {
  slug: string;
  targetId: number;
  activity: Activity;
  canWrite: boolean;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const del = useDeleteActivity(slug);
  const [editing, setEditing] = useState(false);
  const [addGoal, setAddGoal] = useState(false);

  async function remove() {
    const ok = await confirm({
      title: 'Delete activity',
      message: `Delete “${activity.name}” and its goals? This can’t be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await del.mutateAsync(activity.id);
      toast.success('Activity deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div className="rounded-card border border-border bg-surface-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text">
            {activity.name}
            {activity.category && (
              <span className="ml-1.5 text-xs font-normal text-muted">· {activity.category}</span>
            )}
          </p>
        </div>
        {canWrite && (
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <button
              type="button"
              onClick={remove}
              aria-label={`Delete activity ${activity.name}`}
              title="Delete activity"
              className="px-1.5 text-muted hover:text-danger"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <ul className="mt-2 flex flex-col gap-2">
        {activity.goals.length === 0 ? (
          <li className="text-sm text-muted">No goals yet.</li>
        ) : (
          activity.goals.map((goal) => (
            <GoalRow key={goal.id} slug={slug} goal={goal} canWrite={canWrite} />
          ))
        )}
      </ul>

      {canWrite && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setAddGoal(true)}>
          Add goal
        </Button>
      )}

      <ActivityModal
        slug={slug}
        targetId={targetId}
        open={editing}
        onClose={() => setEditing(false)}
        mode="edit"
        activity={activity}
      />
      <GoalModal
        slug={slug}
        activityId={activity.id}
        open={addGoal}
        onClose={() => setAddGoal(false)}
        mode="create"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Goal row
// ---------------------------------------------------------------------------

function GoalRow({ slug, goal, canWrite }: { slug: string; goal: Goal; canWrite: boolean }) {
  const confirm = useConfirm();
  const toast = useToast();
  const updateGoal = useUpdateGoal(slug);
  const del = useDeleteGoal(slug);
  const linkEvidence = useLinkGoalEvidence(slug);
  const [editing, setEditing] = useState(false);
  const [pickEvidence, setPickEvidence] = useState(false);
  const [pickFinding, setPickFinding] = useState(false);

  async function setStatus(status: Goal['status']) {
    try {
      await updateGoal.mutateAsync({ id: goal.id, patch: { status } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update status');
    }
  }

  async function remove() {
    const ok = await confirm({
      title: 'Delete goal',
      message: `Delete “${goal.title}”? Linked evidence and findings are kept.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await del.mutateAsync(goal.id);
      toast.success('Goal deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function onPickEvidence(picked: { uuid: string }[]) {
    if (picked.length === 0) return;
    try {
      await linkEvidence.mutateAsync({
        goalId: goal.id,
        evidenceUuids: picked.map((e) => e.uuid),
      });
      toast.success(`Linked ${picked.length} evidence`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not link evidence');
    }
  }

  return (
    <li className="rounded-input border border-border bg-surface p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 truncate text-sm text-text">{goal.title}</span>
          {goal.isRetest && <Badge tone="warning">Retest</Badge>}
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={remove}
            aria-label={`Delete goal ${goal.title}`}
            title="Delete goal"
            className="px-1 text-muted hover:text-danger"
          >
            ✕
          </button>
        )}
      </div>

      {goal.notes && <p className="mt-1 text-xs text-muted">{goal.notes}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <GoalStatusControl
          value={goal.status}
          onChange={(status) => void setStatus(status)}
          disabled={!canWrite}
          disabledTitle={READ_ONLY_TITLE}
        />
        {!canWrite && (
          <span className="text-xs text-muted">{GOAL_STATUS_LABELS[goal.status]}</span>
        )}
        {canWrite && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">
          Evidence ({goal.numEvidence}) · Findings ({goal.numFindings})
        </span>
        {canWrite && (
          <>
            <Button size="sm" variant="secondary" onClick={() => setPickEvidence(true)}>
              Link evidence
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setPickFinding(true)}>
              Link finding
            </Button>
          </>
        )}
      </div>

      <GoalModal
        slug={slug}
        activityId={0}
        open={editing}
        onClose={() => setEditing(false)}
        mode="edit"
        goal={goal}
      />
      {/*
        Reuse the finding's evidence picker in selection mode. On pick, link the
        chosen evidence to this goal. We don't know linked uuids from the tree, so
        we don't pre-filter — the server ignores duplicate links.
      */}
      <EvidencePickerModal
        slug={slug}
        attachedUuids={[]}
        targetInPath={false}
        open={pickEvidence}
        onClose={() => setPickEvidence(false)}
        onPick={(picked) => void onPickEvidence(picked)}
      />
      <FindingPickerModal
        slug={slug}
        goalId={goal.id}
        linkedUuids={[]}
        open={pickFinding}
        onClose={() => setPickFinding(false)}
      />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Target / Activity / Goal add-edit modals
// ---------------------------------------------------------------------------

function TargetModal({
  slug,
  open,
  onClose,
  mode,
  target,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  target?: Target;
}) {
  const toast = useToast();
  const create = useCreateTarget(slug);
  const update = useUpdateTarget(slug);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (open) {
      setName(target?.name ?? '');
      setDescription(target?.description ?? '');
    }
  }, [open, target]);

  const busy = create.isPending || update.isPending;

  async function submit() {
    try {
      if (mode === 'edit' && target) {
        await update.mutateAsync({ id: target.id, patch: { name, description } });
        toast.success('Target updated');
      } else {
        await create.mutateAsync({ name, description });
        toast.success('Target added');
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save target');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'edit' ? 'Edit target' : 'Add target'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={!name.trim()}>
            {mode === 'edit' ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" htmlFor="t-name">
          <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Description" htmlFor="t-desc" hint="Optional">
          <MarkdownField
            id="t-desc"
            rows={3}
            value={description}
            onChange={(v) => setDescription(v)}
          />
        </Field>
      </div>
    </Modal>
  );
}

function ActivityModal({
  slug,
  targetId,
  open,
  onClose,
  mode,
  activity,
}: {
  slug: string;
  targetId: number;
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  activity?: Activity;
}) {
  const toast = useToast();
  const create = useCreateActivity(slug);
  const update = useUpdateActivity(slug);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    if (open) {
      setName(activity?.name ?? '');
      setCategory(activity?.category ?? '');
    }
  }, [open, activity]);

  const busy = create.isPending || update.isPending;

  async function submit() {
    try {
      if (mode === 'edit' && activity) {
        await update.mutateAsync({ id: activity.id, patch: { name, category } });
        toast.success('Activity updated');
      } else {
        await create.mutateAsync({ targetId, input: { name, category } });
        toast.success('Activity added');
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save activity');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'edit' ? 'Edit activity' : 'Add activity'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={!name.trim()}>
            {mode === 'edit' ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" htmlFor="a-name">
          <Input id="a-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field
          label="Category"
          htmlFor="a-cat"
          hint="Optional testing category (used to label the auto-created tag)."
        >
          <Input id="a-cat" value={category} onChange={(e) => setCategory(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function GoalModal({
  slug,
  activityId,
  open,
  onClose,
  mode,
  goal,
}: {
  slug: string;
  activityId: number;
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  goal?: Goal;
}) {
  const toast = useToast();
  const create = useCreateGoal(slug);
  const update = useUpdateGoal(slug);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [isRetest, setIsRetest] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(goal?.title ?? '');
      setNotes(goal?.notes ?? '');
      setIsRetest(goal?.isRetest ?? false);
    }
  }, [open, goal]);

  const busy = create.isPending || update.isPending;

  async function submit() {
    try {
      if (mode === 'edit' && goal) {
        await update.mutateAsync({ id: goal.id, patch: { title, notes, isRetest } });
        toast.success('Goal updated');
      } else {
        await create.mutateAsync({ activityId, input: { title, notes, isRetest } });
        toast.success('Goal added');
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save goal');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'edit' ? 'Edit goal' : 'Add goal'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={!title.trim()}>
            {mode === 'edit' ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Title" htmlFor="g-title">
          <Input id="g-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Notes" htmlFor="g-notes" hint="Optional">
          <Textarea
            id="g-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={isRetest}
            onChange={(e) => setIsRetest(e.target.checked)}
            className="h-4 w-4 rounded border-border text-accent accent-[var(--accent)]"
          />
          Retest item (carried over from a prior report)
        </label>
      </div>
    </Modal>
  );
}
