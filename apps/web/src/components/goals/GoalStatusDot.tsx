import { GOAL_STATUS_LABELS, type GoalStatus } from '@reporter/shared';

/**
 * A small colored dot for a goal's status, using theme tokens only. `complete`
 * reads as success, `in_progress` as accent, `not_started` as muted, and
 * `not_applicable` as a hollow ring.
 */
const DOT: Record<GoalStatus, string> = {
  not_started: 'bg-surface-2 border border-border',
  in_progress: 'bg-accent',
  complete: 'bg-success',
  not_applicable: 'border border-border bg-transparent',
};

export function GoalStatusDot({ status }: { status: GoalStatus }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${DOT[status]}`}
      aria-hidden="true"
      title={GOAL_STATUS_LABELS[status]}
    />
  );
}
