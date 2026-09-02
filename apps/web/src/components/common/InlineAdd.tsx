import { useEffect, useRef, useState } from 'react';
import { Button } from '@reporter/ui';

/**
 * Inline single-field "＋ Add …" affordance. Collapsed it's a quiet text button;
 * clicking reveals one input — Enter creates (and keeps focus for rapid entry),
 * Esc/blur-when-empty cancels. The heavier "full" editor (description, category,
 * notes, …) stays in the row's Edit modal; this is just the fast add path.
 */
export function InlineAdd({
  label,
  placeholder,
  onAdd,
  disabled,
  disabledTitle,
}: {
  label: string;
  placeholder?: string;
  onAdd: (value: string) => Promise<void> | void;
  disabled?: boolean;
  disabledTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function submit() {
    const v = value.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      await onAdd(v);
      setValue('');
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        title={disabled ? disabledTitle : undefined}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-input px-2 py-1 text-sm text-muted hover:text-text disabled:opacity-50"
      >
        <span aria-hidden="true">＋</span> {label}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
          } else if (e.key === 'Escape') {
            setOpen(false);
            setValue('');
          }
        }}
        onBlur={() => {
          if (!value.trim() && !busy) setOpen(false);
        }}
        className="w-full rounded-input border border-border bg-surface px-2 py-1 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <Button size="sm" onClick={() => void submit()} loading={busy} disabled={!value.trim()}>
        Add
      </Button>
    </div>
  );
}
