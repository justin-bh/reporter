import type { ReactNode } from 'react';
import { Card } from '@reporter/ui';

/**
 * A collapsible "view ↔ edit" section. Collapsed it shows `summary` (a read-only
 * view of the values); expanded it shows `children` (the edit form). Toggling is
 * deliberate — the parent owns `open` and decides what to do on collapse (e.g.
 * discard an in-progress edit). Used to stack the evidence Details / Linked-goals
 * panels above the content.
 */
export function AccordionSection({
  title,
  open,
  onOpenChange,
  summary,
  actions,
  children,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Read-only content shown when collapsed. */
  summary?: ReactNode;
  /** Optional header right-slot (e.g. a status badge). */
  actions?: ReactNode;
  /** Editable content shown when expanded. */
  children: ReactNode;
}) {
  const panelId = `acc-${title.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            aria-hidden="true"
            className={`select-none text-xs text-muted transition-transform ${open ? 'rotate-90' : ''}`}
          >
            ▶
          </span>
          <span className="text-sm font-semibold text-text">{title}</span>
          {!open && <span className="text-xs font-normal text-muted">· click to edit</span>}
        </button>
        {actions}
      </div>
      <div id={panelId}>{open ? children : summary}</div>
    </Card>
  );
}
