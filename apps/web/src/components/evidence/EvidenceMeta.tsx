import { Badge, TagChip } from '@reporter/ui';
import { EVIDENCE_TYPE_LABELS, type Evidence } from '@reporter/shared';
import { formatDateTime } from '../../lib/format.js';

/** Shared evidence chrome: type, operator, timestamp, and tags. */
export function EvidenceMeta({ evidence }: { evidence: Evidence }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
      <Badge tone="accent">{EVIDENCE_TYPE_LABELS[evidence.contentType]}</Badge>
      <span>
        {evidence.operator.firstName} {evidence.operator.lastName}
      </span>
      <span>·</span>
      <time dateTime={evidence.occurredAt}>{formatDateTime(evidence.occurredAt)}</time>
      {evidence.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {evidence.tags.map((t) => (
            <TagChip key={t.id} name={t.name} colorName={t.colorName} />
          ))}
        </div>
      )}
    </div>
  );
}
