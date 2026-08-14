import { useMemo, useState } from 'react';
import { Badge, Button, Checkbox, Input, Popover } from '@reporter/ui';
import type { EvidenceOperator } from '../../../api/hooks.js';

/** Searchable operator multi-select popover. Values are operator slugs. */
export function OperatorFilter({
  value,
  operators,
  note,
  onChange,
}: {
  value: string[];
  operators: EvidenceOperator[];
  /** Optional hint shown when the option list is derived, not authoritative. */
  note?: string;
  onChange: (slugs: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = new Set(value);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return operators;
    return operators.filter(
      (o) =>
        `${o.firstName} ${o.lastName}`.toLowerCase().includes(q) ||
        o.slug.toLowerCase().includes(q),
    );
  }, [operators, search]);

  const toggle = (slug: string) => {
    const next = new Set(selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onChange([...next]);
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label="Filter by operator"
      trigger={
        <Button variant="secondary" size="sm">
          Operator
          {value.length > 0 && <Badge tone="accent">{value.length}</Badge>}
        </Button>
      }
    >
      <div className="flex w-60 flex-col gap-2 p-1">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search operators…"
          aria-label="Search operators"
        />
        <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted">No operators found.</p>
          ) : (
            filtered.map((o) => (
              <Checkbox
                key={o.slug}
                id={`op-${o.slug}`}
                label={`${o.firstName} ${o.lastName}`.trim() || o.slug}
                checked={selected.has(o.slug)}
                onChange={() => toggle(o.slug)}
              />
            ))
          )}
        </div>
        {note && <p className="text-xs text-muted">{note}</p>}
      </div>
    </Popover>
  );
}
