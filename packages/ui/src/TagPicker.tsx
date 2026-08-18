import { tagColor } from '@reporter/shared';
import { useTheme } from './theme.js';
import { cn } from './cn.js';

export interface PickableTag {
  id: number;
  name: string;
  colorName: string;
}

export interface TagPickerProps {
  tags: PickableTag[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  emptyHint?: string;
  /** Render the chips greyed out and ignore toggles. */
  disabled?: boolean;
  /** Tooltip for the whole picker (e.g. why it is disabled). */
  title?: string;
}

/** Toggleable set of tag chips. Selected chips are filled, others outlined. */
export function TagPicker({
  tags,
  selectedIds,
  onChange,
  emptyHint,
  disabled,
  title,
}: TagPickerProps) {
  const { resolved } = useTheme();
  const selected = new Set(selectedIds);

  if (tags.length === 0) {
    return <p className="text-sm text-muted">{emptyHint ?? 'No tags yet.'}</p>;
  }

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <div className="flex flex-wrap gap-1.5" title={title}>
      {tags.map((t) => {
        const color = tagColor(t.colorName);
        const bg = resolved === 'dark' ? color.dark : color.light;
        const isOn = selected.has(t.id);
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={isOn}
            disabled={disabled}
            onClick={() => toggle(t.id)}
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-medium transition-opacity',
              'disabled:opacity-50',
              !isOn && 'border',
            )}
            style={
              isOn
                ? { backgroundColor: bg, color: color.fg }
                : { borderColor: bg, color: 'var(--text-muted)' }
            }
          >
            {t.name}
          </button>
        );
      })}
    </div>
  );
}
