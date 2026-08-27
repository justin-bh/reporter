import { Badge, Card } from '@reporter/ui';
import type { ReadinessResult } from '../../lib/report-readiness.js';

/**
 * The report-readiness gauge shown atop the Content tab: a progress bar plus a
 * checklist of required items, each jumpable and markable "Not applicable".
 * "Ready to report" here means report *content* completeness — distinct from a
 * single finding's "Ready to report" flag.
 */
export function ReportReadiness({
  result,
  disabled,
  onJump,
  onToggleNa,
  findingsHref,
}: {
  result: ReadinessResult;
  disabled: boolean;
  /** Scroll the Content form to the given element id. */
  onJump: (anchor: string) => void;
  onToggleNa: (key: string, na: boolean) => void;
  /** Link target for the "Ready to report" finding item (the Findings tab). */
  findingsHref: string;
}) {
  const remaining = result.total - result.satisfiedCount;
  return (
    <Card className="space-y-3 p-4 lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text">Report readiness</h3>
          <p className="mt-0.5 text-xs text-muted">
            Complete every required item (or mark it Not applicable) for the report to be ready.
          </p>
        </div>
        {result.ready ? (
          <Badge tone="success">Ready to report</Badge>
        ) : (
          <Badge tone="warning">
            {remaining} item{remaining === 1 ? '' : 's'} left
          </Badge>
        )}
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={result.total}
          aria-valuenow={result.satisfiedCount}
          aria-label="Report readiness"
        >
          <div
            className={result.ready ? 'h-full bg-success' : 'h-full bg-accent'}
            style={{ width: `${result.percent}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted">
          {result.satisfiedCount}/{result.total}
        </span>
      </div>

      <ul className="grid gap-1.5 sm:grid-cols-2">
        {result.items.map((item) => {
          const tone = item.complete ? 'text-success' : item.na ? 'text-muted' : 'text-warning';
          const mark = item.complete ? '✓' : item.na ? '—' : '!';
          return (
            <li
              key={item.key}
              className="flex items-center justify-between gap-2 rounded-input border border-border bg-surface px-2.5 py-1.5"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${tone}`}
                  aria-hidden
                >
                  {mark}
                </span>
                <span
                  className={`truncate text-xs ${item.complete || item.na ? 'text-text' : 'text-text'}`}
                  title={item.label}
                >
                  {item.label}
                  {item.na && <span className="ml-1 text-[10px] uppercase text-muted">N/A</span>}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {item.anchor ? (
                  <button
                    type="button"
                    onClick={() => onJump(item.anchor!)}
                    className="rounded px-1 text-[11px] text-accent hover:underline"
                  >
                    Jump
                  </button>
                ) : (
                  <a
                    href={findingsHref}
                    className="rounded px-1 text-[11px] text-accent hover:underline"
                  >
                    Findings
                  </a>
                )}
                {!disabled && !item.complete && (
                  <button
                    type="button"
                    onClick={() => onToggleNa(item.key, !item.na)}
                    className="rounded px-1 text-[11px] text-muted hover:text-text hover:underline"
                  >
                    {item.na ? 'Clear' : 'N/A'}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
