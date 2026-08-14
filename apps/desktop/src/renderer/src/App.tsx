import { useEffect, useState } from 'react';
import { useTheme, useToast } from '@reporter/ui';
import { HistoryView } from './views/HistoryView.js';
import { SettingsView } from './views/SettingsView.js';
import { ComposeView } from './views/ComposeView.js';
import { AboutView } from './views/AboutView.js';

type View = 'history' | 'settings' | 'compose' | 'about';

export function App() {
  const [view, setView] = useState<View>('history');
  const { resolved, toggle } = useTheme();
  const toast = useToast();

  useEffect(() => {
    const offNav = window.reporter.onNavigate((v) => setView(v as View));
    const offDraft = window.reporter.onDraftReady(() => setView('compose'));
    const offErr = window.reporter.onCaptureError((msg) => toast.error(msg));
    return () => {
      offNav();
      offDraft();
      offErr();
    };
  }, [toast]);

  return (
    <div className="flex h-screen flex-col bg-bg text-text">
      <header className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <span className="font-semibold">reporter</span>
        <nav className="ml-2 flex gap-1 text-sm">
          <NavBtn active={view === 'history'} onClick={() => setView('history')}>
            History
          </NavBtn>
          <NavBtn active={view === 'settings'} onClick={() => setView('settings')}>
            Settings
          </NavBtn>
          <NavBtn active={view === 'about'} onClick={() => setView('about')}>
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
        {view === 'compose' && <ComposeView onDone={() => setView('history')} />}
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
