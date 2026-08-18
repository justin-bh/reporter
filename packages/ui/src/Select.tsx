import { forwardRef, type SelectHTMLAttributes, type InputHTMLAttributes } from 'react';
import { cn } from './cn.js';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        'w-full rounded-input border border-border bg-surface px-3 py-2 text-sm text-text',
        'focus:border-accent disabled:opacity-50',
        invalid && 'border-danger',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

export function Checkbox({ label, className, id, ...rest }: CheckboxProps) {
  const inputId = id ?? `cb-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <label
      htmlFor={inputId}
      className={cn('flex cursor-pointer items-center gap-2 text-sm text-text', className)}
    >
      <input
        id={inputId}
        type="checkbox"
        className="h-4 w-4 rounded border-border text-accent accent-[var(--accent)]"
        {...rest}
      />
      {label}
    </label>
  );
}
