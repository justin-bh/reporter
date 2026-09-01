import { useState, type ReactNode } from 'react';
import { cn } from '@reporter/ui';

/**
 * A collapsible field/value tree for arbitrary JSON — used to render an HTTP
 * request/response body (or any JSON evidence) as an expandable outline instead
 * of a flat blob. Purely presentational; the value is already-parsed JSON.
 */
export function JsonTree({ value, className }: { value: unknown; className?: string }) {
  return (
    <div className={cn('font-mono text-xs leading-relaxed text-text', className)}>
      <JsonNode value={value} depth={0} />
    </div>
  );
}

/** Cap how many children of one container we render, so a giant array can't hang the view. */
const MAX_CHILDREN = 1000;

function JsonNode({ name, value, depth }: { name?: string; value: unknown; depth: number }) {
  const isArray = Array.isArray(value);
  const isObject = value !== null && typeof value === 'object';
  const label = name !== undefined ? <span className="text-accent">{name}</span> : null;

  // Primitive leaf: `key: value` on one line.
  if (!isObject) {
    return (
      <div className="whitespace-pre-wrap break-words">
        {label}
        {label && <span className="text-muted">: </span>}
        <JsonScalar value={value} />
      </div>
    );
  }

  const entries: [string, unknown][] = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>);
  const shown = entries.slice(0, MAX_CHILDREN);
  const hidden = entries.length - shown.length;
  const open = depth < 2; // top levels expanded; deeper nodes start collapsed
  const bracket = isArray ? ['[', ']'] : ['{', '}'];
  const summary = `${bracket[0]}${entries.length}${bracket[1]}`;

  return <JsonBranch label={label} open={open} summary={summary} count={entries.length}>
    <div className="border-l border-border pl-3">
      {shown.map(([k, v]) => (
        <JsonNode key={k} name={k} value={v} depth={depth + 1} />
      ))}
      {hidden > 0 && <div className="text-muted">… {hidden} more</div>}
    </div>
  </JsonBranch>;
}

function JsonBranch({
  label,
  open: initialOpen,
  summary,
  count,
  children,
}: {
  label: ReactNode;
  open: boolean;
  summary: string;
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-1 text-left hover:text-accent"
      >
        <span
          className={cn('select-none text-muted transition-transform', open && 'rotate-90')}
          aria-hidden="true"
        >
          ▶
        </span>
        <span className="min-w-0 break-words">
          {label}
          {label && <span className="text-muted">: </span>}
          <span className="text-muted">{count === 0 ? summary : open ? '' : summary}</span>
        </span>
      </button>
      {open && <div className="ml-3">{children}</div>}
    </div>
  );
}

/** Render a JSON primitive with a type-appropriate (token) color. */
function JsonScalar({ value }: { value: unknown }) {
  if (value === null) return <span className="text-muted">null</span>;
  if (typeof value === 'string') return <span className="text-success">&quot;{value}&quot;</span>;
  if (typeof value === 'number') return <span className="text-info">{value}</span>;
  if (typeof value === 'boolean') return <span className="text-warning">{String(value)}</span>;
  return <span>{String(value)}</span>;
}
