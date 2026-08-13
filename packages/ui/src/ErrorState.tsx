import type { ReactNode } from 'react';
import { cn } from './cn.js';
import { Button } from './Button.js';

export interface ErrorStateProps {
  title?: string;
  description?: ReactNode;
  /** Optional retry handler; renders a "Try again" button when provided. */
  onRetry?: () => void;
  className?: string;
}

/** A non-dead-end error panel: says what failed and offers a way forward. */
export function ErrorState({ title = "Something went wrong", description, onRetry, className }: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-danger/30 bg-danger/5 px-6 py-10 text-center',
        className,
      )}
    >
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-danger">{title}</h3>
        <p className="max-w-md text-sm text-muted">
          {description ?? 'Couldn’t load this. Check your connection and try again.'}
        </p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
