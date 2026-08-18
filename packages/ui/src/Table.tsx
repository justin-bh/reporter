import type { HTMLAttributes, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from './cn.js';

/** A styled table. Wrap in a container with `overflow-x-auto` for wide content. */
export function Table({ className, children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className={cn('w-full border-collapse text-sm', className)} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
      {children}
    </thead>
  );
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function Tr({ className, children, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('hover:bg-surface-2/60', className)} {...rest}>
      {children}
    </tr>
  );
}

export function Th({ className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th scope="col" className={cn('px-3 py-2 font-medium', className)} {...rest}>
      {children}
    </th>
  );
}

export type SortDirection = 'asc' | 'desc';

export interface SortableThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** Direction when this column is the active sort; omit when inactive. */
  direction?: SortDirection;
  onSort: () => void;
  /** Use `right` for numeric columns so label + indicator stay right-aligned. */
  align?: 'left' | 'right';
}

/**
 * A sortable column header. The whole cell is a button (keyboard reachable,
 * global focus ring) and `aria-sort` reflects the active direction. Inherits
 * the Thead uppercase/muted look; the active column reads as full-text color.
 */
export function SortableTh({
  direction,
  onSort,
  align = 'left',
  className,
  children,
  ...rest
}: SortableThProps) {
  return (
    <th
      scope="col"
      aria-sort={
        direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : undefined
      }
      className={cn('p-0 font-medium', className)}
      {...rest}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          'flex w-full items-center gap-1 px-3 py-2 font-medium uppercase tracking-wide transition-colors hover:text-text',
          align === 'right' && 'justify-end',
          direction ? 'text-text' : 'text-muted',
        )}
      >
        {children}
        {/* Invisible placeholder keeps the column width stable when inactive. */}
        <span aria-hidden="true" className={cn(!direction && 'invisible')}>
          {direction === 'desc' ? '▼' : '▲'}
        </span>
      </button>
    </th>
  );
}

export function Td({ className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-3 py-2 align-middle text-text', className)} {...rest}>
      {children}
    </td>
  );
}
