import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Select,
  Spinner,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useConfirm,
  useToast,
} from '@reporter/ui';
import type { OperationStatus, User } from '@reporter/shared';
import { api } from '../api/client.js';
import { useOperation, useUpdateOperation } from '../api/hooks.js';

interface Member {
  user: User;
  role: 'admin' | 'write' | 'read';
}

export function OperationSettingsPage() {
  const { slug = '' } = useParams();
  const toast = useToast();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: op, isLoading: opLoading, isError: opError, refetch: refetchOp } = useOperation(slug);
  const update = useUpdateOperation(slug);

  const [name, setName] = useState('');
  const [status, setStatus] = useState<OperationStatus>('active');
  useEffect(() => {
    if (op) {
      setName(op.name);
      setStatus(op.status);
    }
  }, [op]);

  const membersQuery = useQuery({
    queryKey: ['op-users', slug],
    queryFn: () => api.get<Member[]>(`/web/operations/${slug}/users`),
  });

  const [userSlug, setUserSlug] = useState('');
  const [role, setRole] = useState<'admin' | 'write' | 'read'>('read');

  const addMember = useMutation({
    mutationFn: () => api.post(`/web/operations/${slug}/users`, { userSlug, role }),
    onSuccess: () => {
      setUserSlug('');
      qc.invalidateQueries({ queryKey: ['op-users', slug] });
      toast.success('Member added');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not add member'),
  });

  const removeMember = useMutation({
    mutationFn: (s: string) => api.del(`/web/operations/${slug}/users/${s}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['op-users', slug] }),
  });

  async function confirmRemoveMember(userSlugToRemove: string, displayName: string) {
    const ok = await confirm({
      title: 'Remove member',
      message: `Remove ${displayName} from this operation?`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) removeMember.mutate(userSlugToRemove);
  }

  async function saveDetails() {
    try {
      await update.mutateAsync({ name, status });
      toast.success('Operation updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4 p-4">
        <h3 className="text-sm font-semibold text-text">Details</h3>
        {opLoading ? (
          <Spinner />
        ) : opError ? (
          <ErrorState description="Couldn’t load this operation." onRetry={() => refetchOp()} />
        ) : (
          <>
            <Field label="Name" htmlFor="op-name">
              <Input id="op-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Status" htmlFor="op-status">
              <Select id="op-status" value={status} onChange={(e) => setStatus(e.target.value as OperationStatus)}>
                <option value="active">Active</option>
                <option value="complete">Complete</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>
            <Button onClick={saveDetails} loading={update.isPending}>
              Save
            </Button>
          </>
        )}
      </Card>

      <Card className="space-y-4 p-4">
        <h3 className="text-sm font-semibold text-text">Members</h3>
        {membersQuery.isLoading ? (
          <Spinner />
        ) : membersQuery.isError ? (
          <ErrorState description="Couldn’t load members." onRetry={() => membersQuery.refetch()} />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {(membersQuery.data ?? []).map((m) => (
                <Tr key={m.user.slug}>
                  <Td>
                    {m.user.firstName} {m.user.lastName}
                  </Td>
                  <Td className="capitalize">{m.role}</Td>
                  <Td className="text-right">
                    <button
                      onClick={() => confirmRemoveMember(m.user.slug, `${m.user.firstName} ${m.user.lastName}`)}
                      className="text-muted hover:text-danger"
                      aria-label={`Remove ${m.user.firstName} ${m.user.lastName}`}
                    >
                      ✕
                    </button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
        <div className="flex items-end gap-2">
          <Field label="User slug" htmlFor="m-slug" className="flex-1">
            <Input id="m-slug" value={userSlug} onChange={(e) => setUserSlug(e.target.value)} placeholder="jane-doe" />
          </Field>
          <Select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="w-32">
            <option value="read">Read</option>
            <option value="write">Write</option>
            <option value="admin">Admin</option>
          </Select>
          <Button onClick={() => addMember.mutate()} disabled={!userSlug} loading={addMember.isPending}>
            Add
          </Button>
        </div>
      </Card>
    </div>
  );
}
