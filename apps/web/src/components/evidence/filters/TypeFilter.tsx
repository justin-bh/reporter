import { useState } from 'react';
import { Badge, Button, Checkbox, Popover } from '@reporter/ui';
import { EVIDENCE_TYPES, EVIDENCE_TYPE_LABELS, type EvidenceType } from '@reporter/shared';

/** Multi-select popover over the fixed evidence-type enum. */
export function TypeFilter({
  value,
  onChange,
}: {
  value: EvidenceType[];
  onChange: (types: EvidenceType[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = new Set(value);

  const toggle = (t: EvidenceType) => {
    const next = new Set(selected);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    onChange(EVIDENCE_TYPES.filter((x) => next.has(x)));
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label="Filter by evidence type"
      trigger={
        <Button variant="secondary" size="sm">
          Type
          {value.length > 0 && <Badge tone="accent">{value.length}</Badge>}
        </Button>
      }
    >
      <div className="flex w-48 flex-col gap-1.5 p-1">
        {EVIDENCE_TYPES.map((t) => (
          <Checkbox
            key={t}
            id={`type-${t}`}
            label={EVIDENCE_TYPE_LABELS[t]}
            checked={selected.has(t)}
            onChange={() => toggle(t)}
          />
        ))}
      </div>
    </Popover>
  );
}
