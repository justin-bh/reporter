import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  EmptyState,
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
import type { EngagementMember, EngagementRole, EngagementStatus } from '@reporter/shared';
import { api } from '../api/client.js';
import { useEngagement, useUpdateEngagement } from '../api/hooks.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EngagementSettingsPage() {
  const { slug = '' } = useParams();
  const toast = useToast();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const {
    data: eng,
    isLoading: engLoading,
    isError: engError,
    refetch: refetchEng,
  } = useEngagement(slug);
  const update = useUpdateEngagement(slug);

  const [name, setName] = useState('');
  const [status, setStatus] = useState<EngagementStatus>('active');
  useEffect(() => {
    if (eng) {
      setName(eng.name);
      setStatus(eng.status);
    }
  }, [eng]);

  const membersQuery = useQuery({
    queryKey: ['eng-users', slug],
    queryFn: () => api.get<EngagementMember[]>(`/web/engagements/${slug}/users`),
  });

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<EngagementRole>('read');
  const emailValid = EMAIL_RE.test(email.trim());

  // Membership changes move the engagement's numUsers count, so refresh the
  // list + detail queries that render it alongside the member table itself.
  function invalidateMembership() {
    qc.invalidateQueries({ queryKey: ['eng-users', slug] });
    qc.invalidateQueries({ queryKey: ['engagements'] });
    qc.invalidateQueries({ queryKey: ['engagement', slug] });
  }

  const addMember = useMutation({
    mutationFn: () => api.post(`/web/engagements/${slug}/users`, { email: email.trim(), role }),
    onSuccess: () => {
      setEmail('');
      setRole('read');
      invalidateMembership();
      toast.success('Member added');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not add member'),
  });

  function submitAddMember(e: FormEvent) {
    e.preventDefault();
    if (emailValid && !addMember.isPending) addMember.mutate();
  }

  const removeMember = useMutation({
    mutationFn: (s: string) => api.del(`/web/engagements/${slug}/users/${s}`),
    onSuccess: invalidateMembership,
  });

  async function confirmRemoveMember(userSlugToRemove: string, displayName: string) {
    const ok = await confirm({
      title: 'Remove member',
      message: `Remove ${displayName} from this engagement?`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) removeMember.mutate(userSlugToRemove);
  }

  async function saveDetails() {
    try {
      await update.mutateAsync({ name, status });
      toast.success('Engagement updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4 p-4">
        <h3 className="text-sm font-semibold text-text">Details</h3>
        {engLoading ? (
          <Spinner />
        ) : engError ? (
          <ErrorState description="Couldn’t load this engagement." onRetry={() => refetchEng()} />
        ) : (
          <>
            <Field label="Name" htmlFor="eng-name">
              <Input id="eng-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Status" htmlFor="eng-status">
              <Select
                id="eng-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as EngagementStatus)}
              >
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
        ) : (membersQuery.data ?? []).length === 0 ? (
          <EmptyState
            title="No members yet"
            description="Add a teammate by their email address below."
          />
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
                    <div className="font-medium text-text">
                      {m.user.firstName} {m.user.lastName}
                    </div>
                    <div className="text-xs text-muted">{m.user.email}</div>
                  </Td>
                  <Td className="capitalize">{m.role}</Td>
                  <Td className="text-right">
                    <button
                      onClick={() =>
                        confirmRemoveMember(m.user.slug, `${m.user.firstName} ${m.user.lastName}`)
                      }
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

        <form onSubmit={submitAddMember} className="space-y-3 border-t border-border pt-4">
          <p className="text-sm font-medium text-text">Add a member</p>
          <div className="flex items-end gap-2">
            <Field label="Email" htmlFor="m-email" className="flex-1">
              <Input
                id="m-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </Field>
            <Field label="Role" htmlFor="m-role">
              <Select
                id="m-role"
                value={role}
                onChange={(e) => setRole(e.target.value as EngagementRole)}
                className="w-32"
              >
                <option value="read">Read</option>
                <option value="write">Write</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <Button type="submit" disabled={!emailValid} loading={addMember.isPending}>
              Add
            </Button>
          </div>
          <p className="text-xs text-muted">
            Enter the email of an existing reporter account, then choose their role.
          </p>
        </form>
      </Card>
    </div>
  );
}
