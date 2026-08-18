import { tagColor } from '@reporter/shared';
import { useTheme } from './theme.js';
import { cn } from './cn.js';

export interface TagChipProps {
  name: string;
  /** Palette color name from `@reporter/shared` TAG_COLORS. */
  colorName: string;
  onRemove?: () => void;
  /** Keep the remove button visible but greyed out and inert. */
  removeDisabled?: boolean;
  removeTitle?: string;
  className?: string;
}

/**
 * A colored tag pill. Colors come from the shared TAG_COLORS palette so a tag
 * looks identical in the web timeline, desktop history, and CLI lists.
 */
export function TagChip({
  name,
  colorName,
  onRemove,
  removeDisabled,
  removeTitle,
  className,
}: TagChipProps) {
  const { resolved } = useTheme();
  const color = tagColor(colorName);
  const bg = resolved === 'dark' ? color.dark : color.light;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        className,
      )}
      style={{ backgroundColor: bg, color: color.fg }}
    >
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removeDisabled}
          title={removeTitle}
          aria-label={`Remove tag ${name}`}
          className="ml-0.5 rounded-full opacity-80 hover:opacity-100 disabled:opacity-40"
          style={{ color: color.fg }}
        >
          ×
        </button>
      )}
    </span>
  );
}
