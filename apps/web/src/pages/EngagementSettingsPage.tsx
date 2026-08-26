import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
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
import {
  type EngagementMember,
  type EngagementRole,
  type EngagementStatus,
} from '@reporter/shared';
import { api } from '../api/client.js';
import { useAuth } from '../auth.js';
import { useDeleteEngagement, useEngagement, useUpdateEngagement } from '../api/hooks.js';
import { fromDateInput, toDateInputValue } from '../lib/format.js';
import { ADMIN_ONLY_TITLE, canAdmin, canWrite } from '../lib/permissions.js';
import { useAutosave } from '../hooks/useAutosave.js';
import { SaveStatusIndicator } from '../components/SaveStatusIndicator.js';
import { TagManager } from '../components/engagement/TagManager.js';
import { CategoryManager } from '../components/engagement/CategoryManager.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The engagement details this page autosaves in one debounced patch. */
interface SettingsForm {
  name: string;
  status: EngagementStatus;
  startedAt: string;
  projectedEndAt: string;
  actualEndAt: string;
}

export function EngagementSettingsPage() {
  const { slug = '' } = useParams();
  const toast = useToast();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { user } = useAuth();
  const {
    data: eng,
    isLoading: engLoading,
    isError: engError,
    refetch: refetchEng,
  } = useEngagement(slug);
  const update = useUpdateEngagement(slug);
  const remove = useDeleteEngagement(slug);
  const navigate = useNavigate();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  // Details, membership, and deletion need the engagement admin role; tags and
  // categories need write. Site admins pass both. The server enforces this too.
  const isEngAdmin = canAdmin(user, eng);
  const isEngWriter = canWrite(user, eng);
  // Read-only pattern: inputs disable along with their save buttons.
  const adminOnlyTitle = isEngAdmin ? undefined : ADMIN_ONLY_TITLE;

  // The engagement details live in one form object so a single debounced autosave
  // persists the `updateEngagementInput` details slice. Report content (metadata,
  // watermark, and structured sections) is edited on the Reports → Content tab.
  const [form, setForm] = useState<SettingsForm>({
    name: '',
    status: 'active',
    // Date fields are held as "YYYY-MM-DD" strings for the native date inputs.
    startedAt: '',
    projectedEndAt: '',
    actualEndAt: '',
  });
  // Typed patch helper so each field's onChange stays terse.
  const patchForm = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Seed the form once per engagement, not on every cache change — membership and
  // favorite mutations replace the cached `eng` object, and reseeding then would
  // clobber an in-progress edit.
  const seededSlug = useRef<string | null>(null);
  const [baseline, setBaseline] = useState<SettingsForm | undefined>(undefined);
  useEffect(() => {
    if (eng && seededSlug.current !== eng.slug) {
      seededSlug.current = eng.slug;
      const seeded: SettingsForm = {
        name: eng.name,
        status: eng.status,
        startedAt: toDateInputValue(eng.startedAt),
        projectedEndAt: toDateInputValue(eng.projectedEndAt),
        actualEndAt: toDateInputValue(eng.actualEndAt),
      };
      setForm(seeded);
      setBaseline(seeded);
    }
  }, [eng]);

  // Name and start date are required. A dirty-but-invalid form parks at `unsaved`
  // and never saves.
  const nameInvalid = form.name.trim().length === 0;
  const startInvalid = form.startedAt.trim().length === 0;
  const formValid = (v: SettingsForm) =>
    v.name.trim().length > 0 && v.startedAt.trim().length > 0;

  const { status: saveStatus, flush } = useAutosave<SettingsForm>({
    value: form,
    baseline,
    // Only engagement writers/admins can save; non-writers see disabled inputs so
    // the form can't go dirty for them, but guard anyway.
    isValid: (v) => isEngAdmin && isEngWriter && formValid(v),
    save: async (v) => {
      await update.mutateAsync({
        // Details
        name: v.name,
        status: v.status,
        // Start date is required; only send it when the field has a value.
        startedAt: v.startedAt ? (fromDateInput(v.startedAt) ?? undefined) : undefined,
        // Nullable dates: an empty field clears them. The server may override
        // actualEndAt when the status transitions (see the route handler).
        projectedEndAt: fromDateInput(v.projectedEndAt),
        actualEndAt: fromDateInput(v.actualEndAt),
      });
      setBaseline(v);
    },
  });

  // The members endpoint is admin-only; read-only members would just get a 403.
  // Only fetch it for engagement admins — everyone else sees a placeholder below.
  const membersQuery = useQuery({
    queryKey: ['eng-users', slug],
    queryFn: () => api.get<EngagementMember[]>(`/web/engagements/${slug}/users`),
    enabled: isEngAdmin,
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

  function openDelete() {
    setConfirmText('');
    setDeleteOpen(true);
  }

  async function handleDelete() {
    try {
      await remove.mutateAsync();
      setDeleteOpen(false);
      toast.success('Engagement deleted');
      navigate('/engagements', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete engagement');
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-text">Details</h3>
          {isEngAdmin && <SaveStatusIndicator status={saveStatus} />}
        </div>
        {engLoading ? (
          <Spinner />
        ) : engError ? (
          <ErrorState description="Couldn’t load this engagement." onRetry={() => refetchEng()} />
        ) : (
          <>
            <Field
              label="Name"
              htmlFor="eng-name"
              required
              error={isEngAdmin && nameInvalid ? 'A name is required.' : undefined}
            >
              <Input
                id="eng-name"
                value={form.name}
                onChange={(e) => patchForm('name', e.target.value)}
                onBlur={() => void flush()}
                invalid={isEngAdmin && nameInvalid}
                disabled={!isEngAdmin}
                title={adminOnlyTitle}
              />
            </Field>
            <Field label="Status" htmlFor="eng-status">
              <Select
                id="eng-status"
                value={form.status}
                onChange={(e) => patchForm('status', e.target.value as EngagementStatus)}
                disabled={!isEngAdmin}
                title={adminOnlyTitle}
              >
                <option value="active">Active</option>
                <option value="complete">Complete</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                label="Start date"
                htmlFor="eng-start"
                required
                error={isEngAdmin && startInvalid ? 'A start date is required.' : undefined}
              >
                <Input
                  id="eng-start"
                  type="date"
                  value={form.startedAt}
                  onChange={(e) => patchForm('startedAt', e.target.value)}
                  onBlur={() => void flush()}
                  invalid={isEngAdmin && startInvalid}
                  disabled={!isEngAdmin}
                  title={adminOnlyTitle}
                />
              </Field>
              <Field label="Projected end" htmlFor="eng-projected" hint="Target date (optional)">
                <Input
                  id="eng-projected"
                  type="date"
                  value={form.projectedEndAt}
                  onChange={(e) => patchForm('projectedEndAt', e.target.value)}
                  onBlur={() => void flush()}
                  disabled={!isEngAdmin}
                  title={adminOnlyTitle}
                />
              </Field>
              <Field
                label="Actual end"
                htmlFor="eng-actual"
                hint="Set automatically on complete/archive"
              >
                <Input
                  id="eng-actual"
                  type="date"
                  value={form.actualEndAt}
                  onChange={(e) => patchForm('actualEndAt', e.target.value)}
                  onBlur={() => void flush()}
                  disabled={!isEngAdmin}
                  title={adminOnlyTitle}
                />
              </Field>
            </div>
          </>
        )}
      </Card>

      <Card className="space-y-4 p-4">
        <h3 className="text-sm font-semibold text-text">Members</h3>
        {!isEngAdmin ? (
          <EmptyState
            title="Members are admin-only"
            description="The member list is visible to engagement admins."
          />
        ) : membersQuery.isLoading ? (
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
                      type="button"
                      onClick={() =>
                        confirmRemoveMember(m.user.slug, `${m.user.firstName} ${m.user.lastName}`)
                      }
                      disabled={!isEngAdmin}
                      title={isEngAdmin ? undefined : ADMIN_ONLY_TITLE}
                      className="text-muted hover:text-danger disabled:opacity-50"
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

        {isEngAdmin && (
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
        )}
      </Card>

      <Card className="space-y-4 p-4">
        <h3 className="text-sm font-semibold text-text">Tags</h3>
        <TagManager slug={slug} readOnly={!isEngWriter} />
      </Card>

      <Card className="space-y-4 p-4">
        <h3 className="text-sm font-semibold text-text">Finding categories</h3>
        <CategoryManager slug={slug} readOnly={!isEngWriter} />
      </Card>

      {isEngAdmin && (
        <Card className="space-y-4 border-danger/40 p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-danger">Danger zone</h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-text">Delete this engagement</p>
              <p className="text-sm text-muted">
                Permanently removes the engagement and all of its evidence, findings, tags, saved
                queries, and members. This cannot be undone.
              </p>
            </div>
            <Button variant="danger" onClick={openDelete} className="shrink-0">
              Delete engagement
            </Button>
          </div>
        </Card>
      )}

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete engagement"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              loading={remove.isPending}
              disabled={confirmText.trim() !== slug}
            >
              Delete engagement
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text">
            This permanently deletes <span className="font-semibold">{eng?.name ?? slug}</span> and
            everything in it — evidence, findings, tags, saved queries, and members. This action
            cannot be undone.
          </p>
          <Field
            label="Confirm"
            htmlFor="del-confirm"
            hint={
              <>
                Type <span className="font-mono text-text">{slug}</span> to enable deletion.
              </>
            }
          >
            <Input
              id="del-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              placeholder={slug}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
