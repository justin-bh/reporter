import { useState, type TextareaHTMLAttributes } from 'react';
import { renderMarkdown, isMarkdownEmpty } from '@reporter/shared';
import { cn } from './cn.js';

/**
 * Render trusted markdown source to styled HTML. Safe by construction — the
 * shared `renderMarkdown` disables raw-HTML passthrough and unsafe link
 * protocols, so the output can be injected directly. Styling lives in
 * `theme.css` under `.md-body` so the editor preview matches the exported
 * report as closely as screen-vs-print allows.
 */
export function MarkdownPreview({ source, className }: { source: string; className?: string }) {
  if (isMarkdownEmpty(source)) {
    return <p className={cn('text-sm text-muted', className)}>Nothing to preview.</p>;
  }
  return (
    <div
      className={cn('md-body text-sm text-text', className)}
      // Safe: renderMarkdown disables raw-HTML passthrough and unsafe link
      // protocols, so the output contains no author-supplied markup/scripts.
      dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }}
    />
  );
}

type NativeTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange' | 'onBlur'
>;

export interface MarkdownFieldProps extends NativeTextareaProps {
  value: string;
  /** Called with the new text value (not the raw event). */
  onChange: (value: string) => void;
  /** Fired when the textarea loses focus — wire to autosave flush. */
  onBlur?: () => void;
  invalid?: boolean;
  rows?: number;
}

/**
 * A markdown editor: a plain textarea with a Write / Preview toggle. The toggle
 * lets an author see exactly how their prose (headings, lists, **bold**,
 * paragraph spacing) will render in the report. Drop-in for the places that
 * previously used a bare `<Textarea>` for prose; `onChange` passes the string
 * value so call sites read `onChange={(v) => …}`.
 */
export function MarkdownField({
  value,
  onChange,
  onBlur,
  invalid,
  disabled,
  rows = 6,
  className,
  id,
  ...rest
}: MarkdownFieldProps) {
  const [mode, setMode] = useState<'write' | 'preview'>('write');

  return (
    <div className={cn('rounded-input border border-border bg-surface', invalid && 'border-danger')}>
      <div className="flex items-center gap-1 border-b border-border px-1.5 py-1">
        <TabButton active={mode === 'write'} onClick={() => setMode('write')}>
          Write
        </TabButton>
        <TabButton active={mode === 'preview'} onClick={() => setMode('preview')}>
          Preview
        </TabButton>
        <span className="ml-auto pr-1 text-[11px] text-muted">Markdown supported</span>
      </div>
      {mode === 'write' ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          rows={rows}
          aria-invalid={invalid || undefined}
          className={cn(
            'w-full resize-y bg-transparent px-3 py-2 text-sm text-text placeholder:text-muted',
            'focus:outline-none disabled:opacity-50',
            className,
          )}
          {...rest}
        />
      ) : (
        <div className="min-h-20 px-3 py-2" style={{ minHeight: `${Math.max(rows, 3) * 1.5}rem` }}>
          <MarkdownPreview source={value} />
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-input px-2 py-0.5 text-xs font-medium transition-colors',
        active ? 'bg-surface-2 text-text' : 'text-muted hover:text-text',
      )}
    >
      {children}
    </button>
  );
}
