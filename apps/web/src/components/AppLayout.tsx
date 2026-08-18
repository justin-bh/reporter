import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Button, useTheme } from '@reporter/ui';
import { useAuth } from '../auth.js';
import { Logo } from './Logo.js';

export function AppLayout() {
  const { user, logout } = useAuth();
  const { resolved, toggle } = useTheme();
  const navigate = useNavigate();

  async function onLogout() {
    // `logout()` clears local auth state even if the request fails, so ignore any
    // error and always land the user on /login. The public route tree would
    // redirect there on its own, but navigating makes it explicit and immediate.
    try {
      await logout();
    } catch {
      // already signed out locally; nothing more to do
    } finally {
      navigate('/login', { replace: true });
    }
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link to="/engagements" className="flex items-center gap-2 font-semibold">
            <Logo size={26} />
            reporter
          </Link>
          <nav className="ml-4 flex items-center gap-1 text-sm">
            <TopLink to="/engagements">Engagements</TopLink>
            {user?.admin && <TopLink to="/admin">Admin</TopLink>}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="rounded-input p-2 text-muted hover:bg-surface-2 hover:text-text"
              title={resolved === 'dark' ? 'Switch to light' : 'Switch to dark'}
            >
              {resolved === 'dark' ? '☀' : '☾'}
            </button>
            <Link
              to="/account"
              className="rounded-input px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-text"
            >
              {user?.firstName} {user?.lastName}
            </Link>
            <Button variant="ghost" size="sm" onClick={onLogout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

function TopLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-input px-3 py-1.5 font-medium transition-colors ${
          isActive ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2 hover:text-text'
        }`
      }
    >
      {children}
    </NavLink>
  );
}
