import { useMemo, useState } from 'react';
import { Badge, Button, Checkbox, Popover } from '@reporter/ui';
import type { StandardRef } from '@reporter/shared';

/**
 * A grouped multi-select for standards references (ISO/SAE 21434 work products,
 * UN R155 requirements, …). Options are grouped by `StandardRef.group`; each is a
 * checkbox labeled "clause — label". Selected ids are stored in `value`. Any id in
 * `value` that isn't in `catalog` (a legacy or removed entry) is preserved and
 * shown as a raw, removable chip so stored mappings never silently break.
 */
export function StandardsPicker({
  catalog,
  value,
  onChange,
  disabled = false,
  disabledTitle,
  label = 'reference',
}: {
  catalog: readonly StandardRef[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  disabledTitle?: string;
  /** Singular noun used in the trigger/aria copy, e.g. "ISO 21434 work product". */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => new Set(value), [value]);

  // Group catalog entries by their heading, preserving catalog order.
  const groups = useMemo(() => {
    const map = new Map<string, StandardRef[]>();
    for (const ref of catalog) {
      const list = map.get(ref.group);
      if (list) list.push(ref);
      else map.set(ref.group, [ref]);
    }
    return [...map.entries()];
  }, [catalog]);

  const catalogIds = useMemo(() => new Set(catalog.map((r) => r.id)), [catalog]);
  // Selected ids not present in the catalog: keep them as raw chips.
  const unknownSelected = value.filter((id) => !catalogIds.has(id));

  function toggle(id: string, checked: boolean) {
    if (checked) {
      if (!selected.has(id)) onChange([...value, id]);
    } else {
      onChange(value.filter((x) => x !== id));
    }
  }

  const selectedInCatalog = catalog.filter((r) => selected.has(r.id));

  return (
    <div className="space-y-2">
      <Popover
        open={open}
        onOpenChange={disabled ? () => {} : setOpen}
        label={`Select ${label}s`}
        trigger={
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled}
            title={disabled ? disabledTitle : undefined}
          >
            {value.length > 0 ? `${value.length} selected` : `Add ${label}`}
          </Button>
        }
      >
        <div className="max-h-80 w-80 max-w-[90vw] overflow-auto p-1">
          {groups.length === 0 ? (
            <p className="p-2 text-xs text-muted">No entries in this catalog.</p>
          ) : (
            groups.map(([group, refs]) => (
              <div key={group} className="mb-2 last:mb-0">
                <p className="px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  {group}
                </p>
                <div className="flex flex-col gap-1">
                  {refs.map((ref) => (
                    <label
                      key={ref.id}
                      className="flex cursor-pointer items-start gap-2 rounded-input px-1 py-1 hover:bg-surface-2"
                    >
                      <span className="pt-0.5">
                        <Checkbox
                          label=""
                          aria-label={`${ref.clause} — ${ref.label}`}
                          checked={selected.has(ref.id)}
                          onChange={(e) => toggle(ref.id, e.target.checked)}
                        />
                      </span>
                      <span className="min-w-0 text-sm text-text">
                        <span className="font-mono text-xs text-muted">{ref.clause}</span>{' '}
                        {ref.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedInCatalog.map((ref) => (
            <Chip
              key={ref.id}
              text={ref.clause}
              title={`${ref.clause} — ${ref.label}`}
              onRemove={disabled ? undefined : () => toggle(ref.id, false)}
            />
          ))}
          {unknownSelected.map((id) => (
            <Chip
              key={id}
              text={id}
              title={`Unknown reference: ${id}`}
              unknown
              onRemove={disabled ? undefined : () => onChange(value.filter((x) => x !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  text,
  title,
  unknown = false,
  onRemove,
}: {
  text: string;
  title?: string;
  unknown?: boolean;
  onRemove?: () => void;
}) {
  return (
    <span title={title}>
      <Badge tone={unknown ? 'warning' : 'neutral'}>
        <span className="inline-flex items-center gap-1">
          <span className="font-mono">{text}</span>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${text}`}
              className="text-muted hover:text-danger"
            >
              ✕
            </button>
          )}
        </span>
      </Badge>
    </span>
  );
}
