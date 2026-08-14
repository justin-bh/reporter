import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Modal,
  Spinner,
  Table,
  Tabs,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useConfirm,
  useToast,
} from '@reporter/ui';
import { api } from '../api/client.js';
import { useAuth } from '../auth.js';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '../api/hooks.js';
import { formatDateTime } from '../lib/format.js';
import { copyToClipboard } from '../lib/clipboard.js';

export function AccountPage() {
  const [tab, setTab] = useState('profile');
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-2xl font-semibold text-text">Account</h1>
      <Tabs
        className="mb-6"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'profile', label: 'Profile' },
          { key: 'security', label: 'Security' },
          { key: 'api-keys', label: 'API keys' },
        ]}
      />
      {tab === 'profile' && <ProfileTab />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'api-keys' && <ApiKeysTab />}
    </div>
  );
}

function ProfileTab() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.put('/web/account/profile', { firstName, lastName });
      await refresh();
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-md space-y-4 p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" htmlFor="fn">
          <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Field>
        <Field label="Last name" htmlFor="ln">
          <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
      </div>
      <Field label="Email">
        <Input value={user?.email ?? ''} disabled />
      </Field>
      <Button onClick={save} loading={busy}>
        Save
      </Button>
    </Card>
  );
}

function SecurityTab() {
  const toast = useToast();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [busy, setBusy] = useState(false);

  async function change() {
    setBusy(true);
    try {
      await api.post('/web/account/password', { currentPassword, newPassword });
      setCurrent('');
      setNew('');
      toast.success('Password changed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-md space-y-4 p-4">
      <h3 className="text-sm font-semibold text-text">Change password</h3>
      <Field label="Current password" htmlFor="cp">
        <Input
          id="cp"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </Field>
      <Field label="New password" htmlFor="np" hint="At least 8 characters.">
        <Input
          id="np"
          type="password"
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          minLength={8}
        />
      </Field>
      <Button onClick={change} loading={busy} disabled={!currentPassword || newPassword.length < 8}>
        Change password
      </Button>
    </Card>
  );
}

function ApiKeysTab() {
  const { data: keys, isLoading, isError, refetch } = useApiKeys();
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();
  const toast = useToast();
  const confirm = useConfirm();
  const [secret, setSecret] = useState<{ accessKey: string; secretKey: string } | null>(null);

  async function confirmRevoke(accessKey: string) {
    const ok = await confirm({
      title: 'Revoke API key',
      message:
        'Revoke this API key? Any desktop app or reporter-term using it will stop working immediately.',
      confirmLabel: 'Revoke',
      danger: true,
    });
    if (ok) revoke.mutate(accessKey);
  }

  async function generate() {
    try {
      const res = await create.mutateAsync();
      setSecret({ accessKey: res.accessKey, secretKey: res.secretKey ?? '' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate key');
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-4">
        <h3 className="text-sm font-semibold text-text">Client API keys</h3>
        <p className="text-sm text-muted">
          Use these in the desktop app and <code className="font-mono">reporter-term</code> to
          submit evidence. The secret is shown only once, at creation.
        </p>
      </Card>

      <div className="flex justify-end">
        <Button onClick={generate} loading={create.isPending}>
          Generate new key
        </Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <ErrorState description="Couldn’t load your API keys." onRetry={() => refetch()} />
      ) : !keys || keys.length === 0 ? (
        <p className="text-sm text-muted">No API keys yet.</p>
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Access key</Th>
              <Th>Last used</Th>
              <Th>Created</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {keys.map((k) => (
              <Tr key={k.accessKey}>
                <Td className="font-mono text-xs">{k.accessKey}</Td>
                <Td>{k.lastAuth ? formatDateTime(k.lastAuth) : <Badge>never</Badge>}</Td>
                <Td>{formatDateTime(k.createdAt)}</Td>
                <Td className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => confirmRevoke(k.accessKey)}>
                    Revoke
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <Modal
        open={Boolean(secret)}
        onClose={() => setSecret(null)}
        title="Your new API key"
        footer={<Button onClick={() => setSecret(null)}>Done</Button>}
      >
        <p className="mb-3 text-sm text-warning">Copy the secret now — it won't be shown again.</p>
        <div className="space-y-2 font-mono text-xs">
          <CopyRow label="Access key" value={secret?.accessKey ?? ''} />
          <CopyRow label="Secret key" value={secret?.secretKey ?? ''} />
        </div>
      </Modal>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const toast = useToast();
  return (
    <div className="rounded-input border border-border bg-surface-2 p-2">
      <div className="mb-1 text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all">{value}</code>
        <Button
          variant="secondary"
          size="sm"
          className="flex-none"
          onClick={async () => {
            const ok = await copyToClipboard(value);
            if (ok) toast.success(`${label} copied`);
            else toast.error('Copy failed — select the text and copy manually');
          }}
        >
          Copy
        </Button>
      </div>
    </div>
  );
}
