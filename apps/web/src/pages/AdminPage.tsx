import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Spinner,
  Table,
  Tabs,
  TagChip,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useConfirm,
  useToast,
} from '@reporter/ui';
import { defaultTagColorFor } from '@reporter/shared';
import { api } from '../api/client.js';
import { useCreateUser, useUpdateUser, useUsers } from '../api/hooks.js';

export function AdminPage() {
  const [tab, setTab] = useState('users');
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-text">Admin</h1>
      <Tabs
        className="mb-6"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'users', label: 'Users' },
          { key: 'default-tags', label: 'Default tags' },
          { key: 'categories', label: 'Finding categories' },
        ]}
      />
      {tab === 'users' && <UsersTab />}
      {tab === 'default-tags' && <DefaultTagsTab />}
      {tab === 'categories' && <CategoriesTab />}
    </div>
  );
}

function UsersTab() {
  const { data: users, isLoading, isError, refetch } = useUsers();
  const updateUser = useUpdateUser();
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>New user</Button>
      </div>
      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <ErrorState description="Couldn’t load users." onRetry={() => refetch()} />
      ) : !users || users.length === 0 ? (
        <EmptyState title="No users yet" description="Create your first user to get started." />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Admin</Th>
              <Th>Status</Th>
            </Tr>
          </Thead>
          <Tbody>
            {(users ?? []).map((u) => (
              <Tr key={u.slug}>
                <Td>
                  {u.firstName} {u.lastName} {u.headless && <Badge>headless</Badge>}
                </Td>
                <Td className="text-muted">{u.email}</Td>
                <Td>
                  <Checkbox
                    id={`admin-${u.slug}`}
                    label=""
                    aria-label={`Toggle admin for ${u.firstName} ${u.lastName}`}
                    checked={u.admin}
                    onChange={(e) =>
                      updateUser.mutate({ slug: u.slug, patch: { admin: e.target.checked } })
                    }
                  />
                </Td>
                <Td>
                  <button
                    onClick={() =>
                      updateUser.mutate({ slug: u.slug, patch: { disabled: !u.disabled } })
                    }
                    className="text-sm"
                    aria-label={`${u.disabled ? 'Enable' : 'Disable'} ${u.firstName} ${u.lastName}`}
                  >
                    {u.disabled ? (
                      <Badge tone="danger">disabled</Badge>
                    ) : (
                      <Badge tone="success">active</Badge>
                    )}
                  </button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
      <CreateUserModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateUser();
  const toast = useToast();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    admin: false,
    headless: false,
  });
  const set = (k: keyof typeof form) => (v: any) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    try {
      await create.mutateAsync({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.headless ? undefined : form.password,
        admin: form.admin,
        headless: form.headless,
      });
      toast.success('User created');
      setForm({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        admin: false,
        headless: false,
      });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create user');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New user"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={!form.email}>
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" htmlFor="u-fn">
            <Input
              id="u-fn"
              value={form.firstName}
              onChange={(e) => set('firstName')(e.target.value)}
            />
          </Field>
          <Field label="Last name" htmlFor="u-ln">
            <Input
              id="u-ln"
              value={form.lastName}
              onChange={(e) => set('lastName')(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Email" htmlFor="u-email">
          <Input
            id="u-email"
            type="email"
            value={form.email}
            onChange={(e) => set('email')(e.target.value)}
          />
        </Field>
        {!form.headless && (
          <Field
            label="Temporary password"
            htmlFor="u-pw"
            hint="The user resets it on first login."
          >
            <Input
              id="u-pw"
              value={form.password}
              onChange={(e) => set('password')(e.target.value)}
            />
          </Field>
        )}
        <div className="flex gap-6">
          <Checkbox
            label="Administrator"
            checked={form.admin}
            onChange={(e) => set('admin')(e.target.checked)}
          />
          <Checkbox
            label="Headless (API only)"
            checked={form.headless}
            onChange={(e) => set('headless')(e.target.checked)}
          />
        </div>
      </div>
    </Modal>
  );
}

interface DefaultTag {
  id: number;
  name: string;
  colorName: string;
}

function DefaultTagsTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['default-tags'],
    queryFn: () => api.get<DefaultTag[]>('/web/admin/default-tags'),
  });
  const [name, setName] = useState('');
  const add = useMutation({
    mutationFn: () =>
      api.post('/web/admin/default-tags', { name, colorName: defaultTagColorFor(name) }),
    onSuccess: () => {
      setName('');
      qc.invalidateQueries({ queryKey: ['default-tags'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const del = useMutation({
    mutationFn: (id: number) => api.del(`/web/admin/default-tags/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['default-tags'] }),
  });

  async function removeTag(id: number, tagName: string) {
    const ok = await confirm({
      title: 'Delete default tag',
      message: `Delete the default tag “${tagName}”? Existing engagements keep their copies.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) del.mutate(id);
  }

  return (
    <Card className="max-w-xl space-y-4 p-4">
      <p className="text-sm text-muted">These tags are copied into every new engagement.</p>
      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <ErrorState description="Couldn’t load default tags." onRetry={() => refetch()} />
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted">No default tags yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {data.map((t) => (
            <TagChip
              key={t.id}
              name={t.name}
              colorName={t.colorName}
              onRemove={() => removeTag(t.id, t.name)}
            />
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <Field label="New default tag" htmlFor="dt" className="flex-1">
          <Input id="dt" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button onClick={() => add.mutate()} disabled={!name} loading={add.isPending}>
          Add
        </Button>
      </div>
    </Card>
  );
}

interface Category {
  id: number;
  category: string;
}

function CategoriesTab() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['finding-categories'],
    queryFn: () => api.get<Category[]>('/web/admin/finding-categories'),
  });
  const [name, setName] = useState('');
  const add = useMutation({
    mutationFn: () => api.post('/web/admin/finding-categories', { category: name }),
    onSuccess: () => {
      setName('');
      qc.invalidateQueries({ queryKey: ['finding-categories'] });
    },
  });
  const del = useMutation({
    mutationFn: (id: number) => api.del(`/web/admin/finding-categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finding-categories'] }),
  });

  async function removeCategory(id: number, category: string) {
    const ok = await confirm({
      title: 'Delete category',
      message: `Delete the finding category “${category}”?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) del.mutate(id);
  }

  return (
    <Card className="max-w-xl space-y-4 p-4">
      <p className="text-sm text-muted">Categories available when classifying findings.</p>
      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <ErrorState description="Couldn’t load categories." onRetry={() => refetch()} />
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted">No categories yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {data.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-input border border-border px-3 py-2 text-sm"
            >
              {c.category}
              <button
                onClick={() => removeCategory(c.id, c.category)}
                className="text-muted hover:text-danger"
                aria-label={`Delete category ${c.category}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <Field label="New category" htmlFor="cat" className="flex-1">
          <Input id="cat" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button onClick={() => add.mutate()} disabled={!name} loading={add.isPending}>
          Add
        </Button>
      </div>
    </Card>
  );
}
