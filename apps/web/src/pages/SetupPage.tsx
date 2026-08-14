import { useState, type FormEvent } from 'react';
import { Button, Card, Field, Input } from '@reporter/ui';
import { api, ApiError } from '../api/client.js';
import { useAuth } from '../auth.js';
import { AuthShell } from '../components/AuthShell.js';

export function SetupPage() {
  const { refresh } = useAuth();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/web/setup', form);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell subtitle="Create the first administrator">
      <Card className="p-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" htmlFor="firstName">
              <Input
                id="firstName"
                value={form.firstName}
                onChange={set('firstName')}
                required
                autoFocus
              />
            </Field>
            <Field label="Last name" htmlFor="lastName">
              <Input id="lastName" value={form.lastName} onChange={set('lastName')} required />
            </Field>
          </div>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" value={form.email} onChange={set('email')} required />
          </Field>
          <Field label="Password" htmlFor="password" hint="At least 8 characters.">
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
              required
              minLength={8}
            />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" loading={busy}>
            Create administrator
          </Button>
        </form>
      </Card>
    </AuthShell>
  );
}
