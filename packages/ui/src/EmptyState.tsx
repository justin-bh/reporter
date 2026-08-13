import type { ReactNode } from 'react';
import { cn } from './cn.js';

export interface EmptyStateProps {
  /** Optional icon/illustration node. */
  icon?: ReactNode;
  title: string;
  /** Instructive copy pointing at the next action. Never a dead end. */
  description?: ReactNode;
  /** Primary call-to-action (usually a <Button>). */
  action?: ReactNode;
  className?: string;
}

/** A friendly empty state that always offers a next step. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border px-6 py-12 text-center',
        className,
      )}
    >
      {icon && <div className="text-muted">{icon}</div>}
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-text">{title}</h3>
        {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
