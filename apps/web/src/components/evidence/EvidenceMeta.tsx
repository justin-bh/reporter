import { Badge, TagChip } from '@reporter/ui';
import { EVIDENCE_TYPE_LABELS, type Evidence } from '@reporter/shared';
import { formatDateTime, formatDayHeading, formatRelative, formatTime } from '../../lib/format.js';

/** Shared evidence chrome: type, operator, timestamp, and tags. */
export function EvidenceMeta({ evidence }: { evidence: Evidence }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
      <Badge tone="accent">{EVIDENCE_TYPE_LABELS[evidence.contentType]}</Badge>
      <span>
        {evidence.operator.firstName} {evidence.operator.lastName}
      </span>
      <span>·</span>
      <time dateTime={evidence.occurredAt} title={formatDateTime(evidence.occurredAt)}>
        {formatDayHeading(evidence.occurredAt)} at {formatTime(evidence.occurredAt)}
      </time>
      <span>({formatRelative(evidence.occurredAt)})</span>
      {evidence.lastEditedBy && (
        <span title={formatDateTime(evidence.updatedAt)}>
          · edited by {evidence.lastEditedBy.firstName} {evidence.lastEditedBy.lastName}{' '}
          {formatRelative(evidence.updatedAt)}
        </span>
      )}
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
