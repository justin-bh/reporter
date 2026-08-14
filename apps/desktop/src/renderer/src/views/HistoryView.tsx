import { useEffect, useState } from 'react';
import { Badge, Button, EmptyState, useConfirm } from '@reporter/ui';
import type { QueueItem, QueueStatus } from '../../../shared/types.js';

const STATUS_TONE: Record<QueueStatus, 'neutral' | 'info' | 'success' | 'danger'> = {
  pending: 'neutral',
  submitting: 'info',
  submitted: 'success',
  failed: 'danger',
};

const TYPE_LABEL = { image: 'Screenshot', codeblock: 'Code block', none: 'Note' } as const;

export function HistoryView({ onCompose }: { onCompose: () => void }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const confirm = useConfirm();

  async function refresh() {
    setItems(await window.reporter.getQueue());
  }

  useEffect(() => {
    refresh();
    return window.reporter.onQueueChanged(refresh);
  }, []);

  async function remove(id: string) {
    const ok = await confirm({
      title: 'Remove item',
      message: 'Remove this item from the queue?',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) await window.reporter.removeItem(id);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" onClick={() => window.reporter.captureArea()}>
          Capture area
        </Button>
        <Button size="sm" variant="secondary" onClick={() => window.reporter.captureWindow()}>
          Capture window
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="Nothing captured yet"
          description="Capture a screenshot above, or use the tray menu. Items appear here and upload automatically."
          action={
            <Button size="sm" onClick={onCompose}>
              Add evidence
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded-card border border-border bg-surface p-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text">
                  {item.description || TYPE_LABEL[item.contentType]}
                </p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                  <Badge tone={STATUS_TONE[item.status]}>{item.status}</Badge>
                  <span>{item.engagementSlug}</span>
                </div>
                {item.status === 'failed' && item.error && (
                  <p className="mt-1 truncate text-xs text-danger" title={item.error}>
                    {item.error}
                  </p>
                )}
              </div>
              <div className="flex flex-none gap-1">
                {item.status === 'failed' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => window.reporter.retryItem(item.id)}
                  >
                    Retry
                  </Button>
                )}
                <button
                  onClick={() => remove(item.id)}
                  aria-label="Remove"
                  className="rounded-input px-2 text-muted hover:text-danger"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
