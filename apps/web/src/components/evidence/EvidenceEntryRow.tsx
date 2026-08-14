import { Link } from 'react-router-dom';
import { Badge, TagChip } from '@reporter/ui';
import { EVIDENCE_TYPE_LABELS, type Evidence } from '@reporter/shared';
import { evidenceThumbUrl } from '../../lib/urls.js';
import { TimestampRail } from './TimestampRail.js';

const TYPE_ICON: Record<string, string> = {
  image: '🖼',
  codeblock: '⌨',
  'terminal-recording': '▸',
  'http-request-cycle': '⇄',
  event: '⚑',
  none: '✎',
};

/** One evidence entry in the daily-journal list. The whole row links to detail. */
export function EvidenceEntryRow({ slug, ev }: { slug: string; ev: Evidence }) {
  const extraTags = ev.tags.length - 4;
  return (
    <li>
      <Link
        to={`/engagements/${slug}/evidence/${ev.uuid}`}
        className="flex items-start gap-3 rounded-card border border-border bg-surface p-3 transition-colors hover:border-accent/50"
      >
        <TimestampRail iso={ev.occurredAt} />
        <div className="h-12 w-12 flex-none overflow-hidden rounded-input border border-border bg-surface-2">
          {ev.hasThumbnail ? (
            <img
              src={evidenceThumbUrl(slug, ev.uuid)}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg text-muted">
              {TYPE_ICON[ev.contentType] ?? '•'}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text">
            {ev.description || <span className="text-muted">No description</span>}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge tone="neutral">{EVIDENCE_TYPE_LABELS[ev.contentType]}</Badge>
            <span>
              {ev.operator.firstName} {ev.operator.lastName}
            </span>
            {ev.tags.slice(0, 4).map((t) => (
              <TagChip key={t.id} name={t.name} colorName={t.colorName} />
            ))}
            {extraTags > 0 && <Badge tone="neutral">+{extraTags}</Badge>}
          </div>
        </div>
      </Link>
    </li>
  );
}
