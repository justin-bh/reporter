import { useCallback, useEffect, useRef, useState } from 'react';
import { Logo, useTheme, useToast } from '@reporter/ui';
import { HistoryView } from './views/HistoryView.js';
import { SettingsView } from './views/SettingsView.js';
import { ComposeView, type LeaveGuard } from './views/ComposeView.js';
import { AboutView } from './views/AboutView.js';

type View = 'history' | 'settings' | 'compose' | 'about';

export function App() {
  const [view, setView] = useState<View>('history');
  const { resolved, toggle } = useTheme();
  const toast = useToast();

  // ComposeView registers a guard here while it's mounted. Any attempt to leave
  // compose (nav click, tray-driven navigate, or the compose Cancel button)
  // runs through it first so a dirty form can prompt "Discard changes?".
  const leaveGuardRef = useRef<LeaveGuard | null>(null);
  const registerLeaveGuard = useCallback((guard: LeaveGuard | null) => {
    leaveGuardRef.current = guard;
  }, []);

  // Guarded view switch: if we're leaving compose, ask the guard first.
  const requestView = useCallback((next: View) => {
    setView((current) => {
      if (current === 'compose' && next !== 'compose' && leaveGuardRef.current) {
        const guard = leaveGuardRef.current;
        void guard().then((ok) => {
          if (ok) setView(next);
        });
        return current; // stay until the guard resolves
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const offNav = window.reporter.onNavigate((v) => requestView(v as View));
    // A fresh capture always wins — the draft that triggered it replaces
    // whatever was being composed, so switch straight to compose.
    const offDraft = window.reporter.onDraftReady(() => setView('compose'));
    const offErr = window.reporter.onCaptureError((msg) => toast.error(msg));
    return () => {
      offNav();
      offDraft();
      offErr();
    };
  }, [toast, requestView]);

  return (
    <div className="flex h-screen flex-col bg-bg text-text">
      <header className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <Logo size={24} />
        <nav className="ml-2 flex gap-1 text-sm">
          <NavBtn active={view === 'history'} onClick={() => requestView('history')}>
            History
          </NavBtn>
          <NavBtn active={view === 'settings'} onClick={() => requestView('settings')}>
            Settings
          </NavBtn>
          <NavBtn active={view === 'about'} onClick={() => requestView('about')}>
            About
          </NavBtn>
        </nav>
        <button
          onClick={toggle}
          className="ml-auto rounded-input p-1.5 text-muted hover:bg-surface-2 hover:text-text"
          aria-label="Toggle theme"
        >
          {resolved === 'dark' ? '☀' : '☾'}
        </button>
      </header>

      <main className="flex-1 overflow-auto p-3">
        {view === 'history' && <HistoryView onCompose={() => setView('compose')} />}
        {view === 'settings' && <SettingsView />}
        {view === 'about' && <AboutView />}
        {view === 'compose' && (
          <ComposeView
            onDone={() => setView('history')}
            registerLeaveGuard={registerLeaveGuard}
          />
        )}
      </main>
    </div>
  );
}

function NavBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-input px-2.5 py-1 font-medium transition-colors ${
        active ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2 hover:text-text'
      }`}
    >
      {children}
    </button>
  );
}
