import { useEffect, useState } from 'react';
import { Button, Modal, Select, SeverityBadge } from '@reporter/ui';
import {
  CVSS_BASE_METRICS,
  CVSS_DEFAULT_METRICS,
  buildVector,
  computeBaseScore,
  parseVector,
  severityFromScore,
  type CvssBaseMetrics,
  type Severity,
} from '@reporter/shared';

export interface CvssResult {
  vector: string;
  score: number;
  severity: Severity;
}

export function CvssCalculator({
  open,
  onClose,
  initialVector,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  initialVector?: string | null;
  onApply: (result: CvssResult) => void;
}) {
  const [metrics, setMetrics] = useState<CvssBaseMetrics>(CVSS_DEFAULT_METRICS);

  // Re-seed from the finding's current vector each time the dialog opens.
  useEffect(() => {
    if (open) setMetrics((initialVector && parseVector(initialVector)) || CVSS_DEFAULT_METRICS);
  }, [open, initialVector]);

  const score = computeBaseScore(metrics);
  const severity = severityFromScore(score);
  const vector = buildVector(metrics);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="CVSS v3.1 base score"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onApply({ vector, score, severity })}>Apply rating</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-card border border-border bg-surface-2 p-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold tabular-nums text-text">{score.toFixed(1)}</span>
            <SeverityBadge severity={severity} />
          </div>
          <code className="max-w-[55%] truncate text-xs text-muted" title={vector}>
            {vector}
          </code>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {CVSS_BASE_METRICS.map((m) => (
            <label key={m.key} className="flex flex-col gap-1 text-sm text-muted">
              {m.label}
              <Select
                value={metrics[m.key]}
                onChange={(e) => setMetrics((prev) => ({ ...prev, [m.key]: e.target.value }))}
              >
                {m.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label} ({o.value})
                  </option>
                ))}
              </Select>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}
