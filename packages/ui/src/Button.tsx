import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from './cn.js';
import { Spinner } from './Spinner.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
}

const base =
  'inline-flex items-center justify-center gap-2 font-medium rounded-input transition-colors ' +
  'disabled:opacity-50 select-none';

// Hover styles are enabled-only: disabled buttons stay hoverable (so their
// `title` explanation shows) but must not shift color.
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-contrast enabled:hover:bg-accent-hover',
  secondary: 'bg-surface-2 text-text border border-border enabled:hover:bg-border',
  ghost: 'bg-transparent text-text enabled:hover:bg-surface-2',
  danger: 'bg-danger text-white enabled:hover:bg-danger-hover',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
});
