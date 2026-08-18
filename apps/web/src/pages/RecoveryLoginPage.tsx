import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, Spinner } from '@reporter/ui';
import { api, ApiError } from '../api/client.js';
import { useAuth } from '../auth.js';
import { AuthShell } from '../components/AuthShell.js';

/**
 * Redeems an admin-issued one-time recovery link (/login/recovery/:code).
 * On success the server sets the session cookie and the auth refresh swaps the
 * router to the signed-in tree.
 */
export function RecoveryLoginPage() {
  const { code = '' } = useParams();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  // The code is single-use, so guard against StrictMode's double effect run.
  const redeemed = useRef(false);

  useEffect(() => {
    if (redeemed.current) return;
    redeemed.current = true;
    api
      .post('/web/login/recovery', { code })
      .then(() => refresh())
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Something went wrong'),
      )
      .finally(() => {
        // The code is a bearer credential — scrub it from the address bar and
        // history once redemption has resolved. (On success the router also
        // replaces the route, but the failure path stays on this page.)
        window.history.replaceState(null, '', '/login/recovery');
      });
  }, []);

  return (
    <AuthShell subtitle="Account recovery">
      <Card className="p-6">
        {error ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-danger">{error}</p>
            <p className="text-sm text-muted">
              Ask an administrator for a new link, or{' '}
              <Link to="/login" className="text-accent hover:underline">
                sign in with your password
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-2">
            <Spinner size={22} />
            <p className="text-sm text-muted">Signing you in…</p>
          </div>
        )}
      </Card>
    </AuthShell>
  );
}
