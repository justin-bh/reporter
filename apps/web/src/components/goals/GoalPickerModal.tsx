import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Spinner,
} from '@reporter/ui';
import { GOAL_STATUS_LABELS, type GoalsTree } from '@reporter/shared';
import { useGoals } from '../../api/hooks.js';
import { GoalStatusDot } from './GoalStatusDot.js';

/**
 * Pick one goal from the engagement's Target → Activity → Goal tree, to link the
 * current evidence or finding to it. Goals whose id is in `excludeGoalIds`
 * (already linked) are omitted.
 */
export function GoalPickerModal({
  slug,
  open,
  onClose,
  onPick,
  excludeGoalIds = [],
  busy = false,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
  onPick: (goalId: number) => void;
  excludeGoalIds?: number[];
  busy?: boolean;
}) {
  const { data, isLoading, isError, refetch } = useGoals(slug);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  const excluded = useMemo(() => new Set(excludeGoalIds), [excludeGoalIds]);
  const q = search.trim().toLowerCase();

  // Flatten to matching goals grouped by their target/activity, dropping already
  // linked goals and anything that doesn't match the filter.
  const groups = useMemo(() => filterTree(data, q, excluded), [data, q, excluded]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add to goal"
      size="md"
      footer={
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter goals, activities, or targets…"
          aria-label="Filter goals"
          autoFocus
        />
        <div className="max-h-[24rem] overflow-auto rounded-card border border-border">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Spinner size={22} />
            </div>
          ) : isError ? (
            <div className="p-4">
              <ErrorState description="Couldn’t load goals." onRetry={() => refetch()} />
            </div>
          ) : groups.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={q ? 'No goals match your filter' : 'No goals to link'}
                description={
                  q
                    ? 'Try a different search.'
                    : 'Add a target and goals on the Goals tab first, or all goals are already linked.'
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {groups.map((g) => (
                <li key={`${g.targetId}-${g.activityId}`} className="p-2">
                  <p className="px-1 pb-1 text-xs text-muted">
                    {g.targetName} · {g.activityName}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {g.goals.map((goal) => (
                      <li key={goal.id}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onPick(goal.id)}
                          className="flex w-full items-center gap-2 rounded-input px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-2 disabled:opacity-50"
                        >
                          <GoalStatusDot status={goal.status} />
                          <span className="min-w-0 flex-1 truncate text-text">{goal.title}</span>
                          {goal.isRetest && <Badge tone="warning">Retest</Badge>}
                          <span className="shrink-0 text-xs text-muted">
                            {GOAL_STATUS_LABELS[goal.status]}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

interface FilteredGroup {
  targetId: number;
  activityId: number;
  targetName: string;
  activityName: string;
  goals: GoalsTree['targets'][number]['activities'][number]['goals'];
}

function filterTree(
  data: GoalsTree | undefined,
  q: string,
  excluded: Set<number>,
): FilteredGroup[] {
  if (!data) return [];
  const out: FilteredGroup[] = [];
  for (const target of data.targets) {
    for (const activity of target.activities) {
      const context = `${target.name} ${activity.name}`.toLowerCase();
      const goals = activity.goals.filter(
        (goal) =>
          !excluded.has(goal.id) &&
          (!q || goal.title.toLowerCase().includes(q) || context.includes(q)),
      );
      if (goals.length > 0) {
        out.push({
          targetId: target.id,
          activityId: activity.id,
          targetName: target.name,
          activityName: activity.name,
          goals,
        });
      }
    }
  }
  return out;
}
