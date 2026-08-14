import { SEVERITY_LABELS, tagColor, type Severity } from '@reporter/shared';
import { useTheme } from './theme.js';
import { cn } from './cn.js';

/** Severity → shared palette color name, so severities look identical everywhere. */
const SEVERITY_COLOR: Record<Severity, string> = {
  critical: 'red',
  high: 'orange',
  medium: 'amber',
  low: 'green',
  none: 'slate',
};

export interface SeverityBadgeProps {
  severity: Severity | null;
  /** CVSS base score to show alongside the label (e.g. 9.8). */
  score?: number | null;
  className?: string;
}

/**
 * A colored severity pill on the CVSS v3.1 scale. `null` renders a muted
 * "Unrated" chip so unrated findings still read clearly.
 */
export function SeverityBadge({ severity, score, className }: SeverityBadgeProps) {
  const { resolved } = useTheme();

  if (!severity) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted',
          className,
        )}
      >
        Unrated
      </span>
    );
  }

  const color = tagColor(SEVERITY_COLOR[severity]);
  const bg = resolved === 'dark' ? color.dark : color.light;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        className,
      )}
      style={{ backgroundColor: bg, color: color.fg }}
    >
      {SEVERITY_LABELS[severity]}
      {score != null && <span className="tabular-nums opacity-90">{score.toFixed(1)}</span>}
    </span>
  );
}
