import type { ReactNode } from 'react';
import { Logo } from './Logo.js';

/** Centered branded shell for the login and setup screens. */
export function AuthShell({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Logo size={40} />
          <div>
            <h1 className="text-xl font-semibold text-text">reporter</h1>
            <p className="text-sm text-muted">{subtitle}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
