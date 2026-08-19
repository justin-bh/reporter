import { useState } from 'react';
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
  /**
   * When provided, an inline "+ New tag" affordance is shown. Called with the
   * typed name; must create the tag (assigning a color) and resolve to its new
   * numeric id, which the picker then selects. Reject to signal failure (the
   * caller is responsible for user-facing errors); the typed name is kept so the
   * user can retry. Omit to hide the affordance (e.g. read-only or filter use).
   */
  onCreateTag?: (name: string) => Promise<number>;
}

/** Toggleable set of tag chips, with an optional inline "create tag" control. */
export function TagPicker({
  tags,
  selectedIds,
  onChange,
  emptyHint,
  disabled,
  title,
  onCreateTag,
}: TagPickerProps) {
  const { resolved } = useTheme();
  const selected = new Set(selectedIds);

  const canCreate = Boolean(onCreateTag) && !disabled;
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);

  // No tags and no way to add one → just the hint.
  if (tags.length === 0 && !canCreate) {
    return <p className="text-sm text-muted">{emptyHint ?? 'No tags yet.'}</p>;
  }

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  async function submitNew() {
    const name = draft.trim();
    if (!name || !onCreateTag) return;
    setPending(true);
    try {
      const id = await onCreateTag(name);
      // Select the freshly-created tag; the parent's list refetch renders its chip.
      if (!selected.has(id)) onChange([...selectedIds, id]);
      setDraft('');
      setCreating(false);
    } catch {
      // Keep the draft so the user can retry; the caller surfaces the error.
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" title={title}>
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

      {canCreate &&
        (creating ? (
          <span className="inline-flex items-center gap-1">
            <input
              autoFocus
              value={draft}
              disabled={pending}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submitNew();
                } else if (e.key === 'Escape') {
                  setDraft('');
                  setCreating(false);
                }
              }}
              onBlur={() => {
                if (!draft.trim()) setCreating(false);
              }}
              placeholder="New tag…"
              aria-label="New tag name"
              maxLength={64}
              className="h-6 w-28 rounded-full border border-border bg-surface px-2.5 text-xs text-text outline-none focus:border-accent disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void submitNew()}
              disabled={pending || !draft.trim()}
              aria-label="Create tag"
              className="rounded-full px-1.5 text-xs font-medium text-accent hover:opacity-80 disabled:opacity-40"
            >
              {pending ? '…' : 'Add'}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
          >
            + New tag
          </button>
        ))}
    </div>
  );
}
