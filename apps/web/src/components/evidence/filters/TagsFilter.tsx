import { useState } from 'react';
import { Badge, Button, Popover, TagPicker, type PickableTag } from '@reporter/ui';

/**
 * Tag multi-select popover. Works in tag IDs internally (TagPicker) but the
 * timeline query addresses tags by name, so this maps between the two.
 */
export function TagsFilter({
  value,
  tags,
  onChange,
}: {
  /** Selected tag names (as they appear in the query). */
  value: string[];
  tags: PickableTag[];
  onChange: (names: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedIds = tags.filter((t) => value.includes(t.name)).map((t) => t.id);

  const apply = (ids: number[]) => {
    const idSet = new Set(ids);
    onChange(tags.filter((t) => idSet.has(t.id)).map((t) => t.name));
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label="Filter by tag"
      trigger={
        <Button variant="secondary" size="sm">
          Tags
          {value.length > 0 && <Badge tone="accent">{value.length}</Badge>}
        </Button>
      }
    >
      <div className="w-56 p-1">
        <TagPicker
          tags={tags}
          selectedIds={selectedIds}
          onChange={apply}
          emptyHint="No tags in this engagement yet."
        />
      </div>
    </Popover>
  );
}
