import type { EngagementProgress } from '@reporter/shared';

/**
 * A compact goal-progress bar built from theme tokens (no hardcoded colors). The
 * filled portion is `progress.percent` of complete goals; N/A goals are excluded
 * from the denominator (matching the server's percent computation).
 */
export function ProgressBar({
  progress,
  className,
  showLabel = false,
}: {
  progress: EngagementProgress;
  className?: string;
  /** Render a `X% · N complete of M` caption beside/under the bar. */
  showLabel?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, progress.percent));
  const denominator = Math.max(0, progress.total - progress.notApplicable);
  return (
    <div className={className}>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Goal progress: ${pct}% complete`}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <p className="mt-1 text-xs text-muted">
          {pct}% · {progress.complete} complete of {denominator}
          {progress.notApplicable > 0 && ` (${progress.notApplicable} N/A)`}
        </p>
      )}
    </div>
  );
}
