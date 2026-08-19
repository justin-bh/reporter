import type { ReactNode } from 'react';
import { Spinner } from '@reporter/ui';
import type { SaveStatus } from '../hooks/useAutosave.js';

/**
 * A small, muted status line for autosaving detail forms. Renders the current
 * `SaveStatus` using `@reporter/ui` tokens (no raw colors) so it reads the same
 * in light and dark. `idle` renders nothing to avoid a persistent empty label.
 */
export function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;

  const content: Record<Exclude<SaveStatus, 'idle'>, ReactNode> = {
    unsaved: <span className="text-muted">Unsaved changes</span>,
    saving: (
      <span className="flex items-center gap-1.5 text-muted">
        <Spinner size={12} /> Saving…
      </span>
    ),
    saved: <span className="text-success">Saved</span>,
    error: <span className="text-danger">Couldn’t save — retrying on next edit</span>,
  };

  return (
    <span role="status" aria-live="polite" className="text-xs">
      {content[status]}
    </span>
  );
}
