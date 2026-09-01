import { useMemo, useState, type ReactNode } from 'react';
import { parseHttpExchanges } from '@reporter/shared';
import { HttpExchangeView } from './HttpExchangeView.js';

/**
 * The Add-evidence "HTTP data" input: a raw textarea with a Write / Preview
 * toggle, matching the Description field's markdown editor. "Preview" parses the
 * pasted data (HAR JSON, loose JSON, or a raw HTTP request/response) and shows the
 * field/value view. Leaves the read-only HarViewer used elsewhere untouched.
 */
export function HttpRequestField({
  id,
  value,
  onChange,
  rows = 8,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const parsed = useMemo(
    () => (mode === 'preview' ? parseHttpExchanges(value) : null),
    [mode, value],
  );

  return (
    <div className="rounded-input border border-border bg-surface">
      <div className="flex items-center gap-1 border-b border-border px-1.5 py-1">
        <TabButton active={mode === 'write'} onClick={() => setMode('write')}>
          Write
        </TabButton>
        <TabButton active={mode === 'preview'} onClick={() => setMode('preview')}>
          Preview
        </TabButton>
        <span className="ml-auto pr-1 text-[11px] text-muted">HAR, JSON, or raw HTTP</span>
      </div>
      {mode === 'write' ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          spellCheck={false}
          placeholder="Paste a HAR export, a request/response JSON, or a raw HTTP request/response."
          className="w-full resize-y bg-transparent px-3 py-2 font-mono text-sm text-text placeholder:text-muted focus:outline-none"
        />
      ) : (
        <div className="px-3 py-2" style={{ minHeight: `${Math.max(rows, 3) * 1.5}rem` }}>
          {parsed && parsed.ok ? (
            <HttpExchangeView entries={parsed.entries} />
          ) : (
            <p className="text-sm text-muted">{parsed ? parsed.error : ''}</p>
          )}
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
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-input px-2 py-0.5 text-xs font-medium transition-colors ${
        active ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'
      }`}
    >
      {children}
    </button>
  );
}
