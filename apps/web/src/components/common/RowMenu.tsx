import { useState } from 'react';
import { Popover, cn } from '@reporter/ui';

export interface RowMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

/**
 * A compact "⋯" overflow menu for row-level actions (Edit / Delete / …), so rows
 * can keep only their primary control visible and tuck the rest away. Built on the
 * shared Popover.
 */
export function RowMenu({
  items,
  label = 'More actions',
  triggerLabel,
}: {
  items: RowMenuItem[];
  label?: string;
  /** When set, the trigger is a labelled button (e.g. "＋ Link…") instead of "⋯". */
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      label={label}
      trigger={
        triggerLabel ? (
          <button
            type="button"
            className="rounded-input px-2 py-0.5 text-xs font-medium text-muted hover:text-text"
          >
            {triggerLabel}
          </button>
        ) : (
          <button
            type="button"
            aria-label={label}
            title={label}
            className="rounded-input px-1.5 py-0.5 text-muted hover:text-text"
          >
            ⋯
          </button>
        )
      }
    >
      <div className="flex min-w-40 flex-col">
        {items.map((it, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              setOpen(false);
              it.onSelect();
            }}
            className={cn(
              'rounded-input px-2 py-1.5 text-left text-sm hover:bg-surface-2',
              it.danger ? 'text-danger' : 'text-text',
            )}
          >
            {it.label}
          </button>
        ))}
      </div>
    </Popover>
  );
}
