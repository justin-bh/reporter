import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  /** The user's chosen mode (may be `system`). */
  mode: ThemeMode;
  /** The effective theme actually applied (`light` or `dark`). */
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'reporter.theme';

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function applyThemeAttribute(mode: ThemeMode): 'light' | 'dark' {
  const resolved = mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode;
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
  }
  return resolved;
}

export interface ThemeProviderProps {
  children: ReactNode;
  /** Default when nothing is persisted. */
  defaultMode?: ThemeMode;
  /** Set false in environments without localStorage (e.g. some Electron contexts). */
  persist?: boolean;
}

export function ThemeProvider({
  children,
  defaultMode = 'system',
  persist = true,
}: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (persist && typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    }
    return defaultMode;
  });
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => applyThemeAttribute(mode));

  const setMode = useCallback(
    (next: ThemeMode) => {
      setModeState(next);
      setResolved(applyThemeAttribute(next));
      if (persist && typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, next);
    },
    [persist],
  );

  const toggle = useCallback(() => {
    setMode(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setMode]);

  // Track system changes while in `system` mode.
  useEffect(() => {
    if (mode !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(applyThemeAttribute('system'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, setMode, toggle }),
    [mode, resolved, setMode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a <ThemeProvider>');
  return ctx;
}
