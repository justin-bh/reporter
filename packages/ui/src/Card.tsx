import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn.js';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** A flat surface panel with the standard card radius and border. */
export function Card({ className, children, ...rest }: CardProps) {
  return (
    <div className={cn('rounded-card border border-border bg-surface', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...rest }: CardProps) {
  return (
    <div className={cn('border-b border-border px-4 py-3', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardBody({ className, children, ...rest }: CardProps) {
  return (
    <div className={cn('p-4', className)} {...rest}>
      {children}
    </div>
  );
}
