import { cn } from './cn.js';

export interface SpinnerProps {
  /** Diameter in pixels. */
  size?: number;
  className?: string;
  label?: string;
}

/** An accessible, token-colored loading spinner. */
export function Spinner({ size = 18, className, label = 'Loading' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn('inline-block animate-spin rounded-full border-2 border-current', className)}
      style={{
        width: size,
        height: size,
        borderTopColor: 'transparent',
        opacity: 0.8,
      }}
    />
  );
}
