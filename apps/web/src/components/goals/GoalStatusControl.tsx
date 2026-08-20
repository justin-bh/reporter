import { GOAL_STATUS_LABELS, GOAL_STATUSES, type GoalStatus } from '@reporter/shared';

/**
 * A compact segmented control for a goal's status. Built from theme tokens; the
 * active segment reads with the surface-2 fill and text color. Keyboard reachable
 * via a radiogroup of buttons.
 */
export function GoalStatusControl({
  value,
  onChange,
  disabled = false,
  disabledTitle,
}: {
  value: GoalStatus;
  onChange: (status: GoalStatus) => void;
  disabled?: boolean;
  disabledTitle?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Goal status"
      className="inline-flex flex-wrap rounded-input border border-border p-0.5"
    >
      {GOAL_STATUSES.map((status) => {
        const active = status === value;
        return (
          <button
            key={status}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            title={disabled ? disabledTitle : undefined}
            onClick={() => onChange(status)}
            className={`rounded-input px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
              active ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'
            }`}
          >
            {GOAL_STATUS_LABELS[status]}
          </button>
        );
      })}
    </div>
  );
}
