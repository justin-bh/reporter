import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Checkbox,
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
  Textarea,
  Th,
  Thead,
  Tr,
  useConfirm,
  useToast,
} from '@reporter/ui';
import {
  WATERMARK_LAYERS,
  WATERMARK_LAYER_LABELS,
  WATERMARK_OPACITIES,
  WATERMARK_OPACITY_LABELS,
  type EngagementMember,
  type EngagementRole,
  type EngagementStatus,
  type WatermarkLayer,
  type WatermarkOpacity,
} from '@reporter/shared';
import { api } from '../api/client.js';
import { useAuth } from '../auth.js';
import { useDeleteEngagement, useEngagement, useUpdateEngagement } from '../api/hooks.js';
import { fromDateInput, toDateInputValue } from '../lib/format.js';
import { ADMIN_ONLY_TITLE, canAdmin, canWrite } from '../lib/permissions.js';
import { TagManager } from '../components/engagement/TagManager.js';
import { CategoryManager } from '../components/engagement/CategoryManager.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const [name, setName] = useState('');
  const [status, setStatus] = useState<EngagementStatus>('active');
  // Date fields are held as "YYYY-MM-DD" strings for the native date inputs.
  const [startedAt, setStartedAt] = useState('');
  const [projectedEndAt, setProjectedEndAt] = useState('');
  const [actualEndAt, setActualEndAt] = useState('');
  // Report metadata — held as plain strings; empty clears the field (sent as null).
  const [clientName, setClientName] = useState('');
  const [assessmentType, setAssessmentType] = useState('');
  const [location, setLocation] = useState('');
  const [scope, setScope] = useState('');
  const [executiveSummary, setExecutiveSummary] = useState('');
  const [methodology, setMethodology] = useState('');
  // Watermark settings for the exported report.
  const [wmEnabled, setWmEnabled] = useState(true);
  const [wmText, setWmText] = useState('');
  const [wmColor, setWmColor] = useState('#64748b');
  const [wmOpacity, setWmOpacity] = useState<WatermarkOpacity>('medium');
  const [wmLayer, setWmLayer] = useState<WatermarkLayer>('behind');
  useEffect(() => {
    if (eng) {
      setName(eng.name);
      setStatus(eng.status);
      setStartedAt(toDateInputValue(eng.startedAt));
      setProjectedEndAt(toDateInputValue(eng.projectedEndAt));
      setActualEndAt(toDateInputValue(eng.actualEndAt));
      setClientName(eng.clientName ?? '');
      setAssessmentType(eng.assessmentType ?? '');
      setLocation(eng.location ?? '');
      setScope(eng.scope ?? '');
      setExecutiveSummary(eng.executiveSummary ?? '');
      setMethodology(eng.methodology ?? '');
      setWmEnabled(eng.watermarkEnabled ?? true);
      setWmText(eng.watermarkText ?? '');
      setWmColor(eng.watermarkColor ?? '#64748b');
      setWmOpacity(eng.watermarkOpacity ?? 'medium');
      setWmLayer(eng.watermarkLayer ?? 'behind');
    }
  }, [eng]);

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

  async function saveDetails() {
    try {
      await update.mutateAsync({
        name,
        status,
        // Start date is required; only send it when the field has a value.
        startedAt: startedAt ? (fromDateInput(startedAt) ?? undefined) : undefined,
        // Nullable dates: an empty field clears them. Note the server overrides
        // actualEndAt when the status transitions (see the route handler).
        projectedEndAt: fromDateInput(projectedEndAt),
        actualEndAt: fromDateInput(actualEndAt),
      });
      toast.success('Engagement updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function saveReport() {
    // Empty string clears the field: send null so the server drops it.
    const orNull = (s: string) => (s.trim() === '' ? null : s);
    try {
      await update.mutateAsync({
        clientName: orNull(clientName),
        assessmentType: orNull(assessmentType),
        location: orNull(location),
        scope: orNull(scope),
        executiveSummary: orNull(executiveSummary),
        methodology: orNull(methodology),
        watermarkEnabled: wmEnabled,
        watermarkText: orNull(wmText),
        watermarkColor: wmColor,
        watermarkOpacity: wmOpacity,
        watermarkLayer: wmLayer,
      });
      toast.success('Report details updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
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
        <h3 className="text-sm font-semibold text-text">Details</h3>
        {engLoading ? (
          <Spinner />
        ) : engError ? (
          <ErrorState description="Couldn’t load this engagement." onRetry={() => refetchEng()} />
        ) : (
          <>
            <Field label="Name" htmlFor="eng-name">
              <Input
                id="eng-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isEngAdmin}
                title={adminOnlyTitle}
              />
            </Field>
            <Field label="Status" htmlFor="eng-status">
              <Select
                id="eng-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as EngagementStatus)}
                disabled={!isEngAdmin}
                title={adminOnlyTitle}
              >
                <option value="active">Active</option>
                <option value="complete">Complete</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Start date" htmlFor="eng-start">
                <Input
                  id="eng-start"
                  type="date"
                  value={startedAt}
                  onChange={(e) => setStartedAt(e.target.value)}
                  disabled={!isEngAdmin}
                  title={adminOnlyTitle}
                />
              </Field>
              <Field label="Projected end" htmlFor="eng-projected" hint="Target date (optional)">
                <Input
                  id="eng-projected"
                  type="date"
                  value={projectedEndAt}
                  onChange={(e) => setProjectedEndAt(e.target.value)}
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
                  value={actualEndAt}
                  onChange={(e) => setActualEndAt(e.target.value)}
                  disabled={!isEngAdmin}
                  title={adminOnlyTitle}
                />
              </Field>
            </div>
            <Button
              onClick={saveDetails}
              loading={update.isPending}
              disabled={!isEngAdmin}
              title={isEngAdmin ? undefined : ADMIN_ONLY_TITLE}
            >
              Save
            </Button>
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

      <Card className="space-y-4 p-4 lg:col-span-2">
        <div>
          <h3 className="text-sm font-semibold text-text">Report details</h3>
          <p className="mt-1 text-xs text-muted">
            Metadata for the exported report PDF. Leave a field blank to omit it.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client / organization name" htmlFor="r-client">
            <Input
              id="r-client"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              disabled={!isEngAdmin}
              title={adminOnlyTitle}
            />
          </Field>
          <Field
            label="Assessment type"
            htmlFor="r-type"
            hint="e.g. External Penetration Assessment"
          >
            <Input
              id="r-type"
              value={assessmentType}
              onChange={(e) => setAssessmentType(e.target.value)}
              disabled={!isEngAdmin}
              title={adminOnlyTitle}
            />
          </Field>
        </div>
        <Field label="Location / environment" htmlFor="r-location">
          <Input
            id="r-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={!isEngAdmin}
            title={adminOnlyTitle}
          />
        </Field>
        <Field label="Scope" htmlFor="r-scope">
          <Textarea
            id="r-scope"
            rows={3}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            disabled={!isEngAdmin}
            title={adminOnlyTitle}
          />
        </Field>
        <Field label="Executive summary" htmlFor="r-exec">
          <Textarea
            id="r-exec"
            rows={5}
            value={executiveSummary}
            onChange={(e) => setExecutiveSummary(e.target.value)}
            disabled={!isEngAdmin}
            title={adminOnlyTitle}
          />
        </Field>
        <Field label="Methodology" htmlFor="r-method">
          <Textarea
            id="r-method"
            rows={5}
            value={methodology}
            onChange={(e) => setMethodology(e.target.value)}
            disabled={!isEngAdmin}
            title={adminOnlyTitle}
          />
        </Field>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium text-text">Watermark</p>
          <p className="mt-1 text-xs text-muted">
            Drawn diagonally across every page of the exported report PDF except the title page.
          </p>
        </div>
        <Checkbox
          label="Show a watermark on the exported report"
          checked={wmEnabled}
          disabled={!isEngAdmin}
          onChange={(e) => setWmEnabled(e.target.checked)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Watermark text" htmlFor="wm-text" hint="Defaults to CONFIDENTIAL">
            <Input
              id="wm-text"
              value={wmText}
              placeholder="CONFIDENTIAL"
              onChange={(e) => setWmText(e.target.value)}
              disabled={!isEngAdmin || !wmEnabled}
              title={adminOnlyTitle}
            />
          </Field>
          <Field label="Color" htmlFor="wm-color">
            <div className="flex items-center gap-2">
              <input
                type="color"
                id="wm-color"
                aria-label="Watermark color"
                value={wmColor}
                onChange={(e) => setWmColor(e.target.value)}
                disabled={!isEngAdmin || !wmEnabled}
                className="h-9 w-12 shrink-0 rounded-input border border-border bg-surface disabled:opacity-50"
              />
              <Input
                value={wmColor}
                onChange={(e) => setWmColor(e.target.value)}
                disabled={!isEngAdmin || !wmEnabled}
                title={adminOnlyTitle}
                className="font-mono"
                aria-label="Watermark color hex"
              />
            </div>
          </Field>
          <Field label="Transparency" htmlFor="wm-opacity">
            <Select
              id="wm-opacity"
              value={wmOpacity}
              onChange={(e) => setWmOpacity(e.target.value as WatermarkOpacity)}
              disabled={!isEngAdmin || !wmEnabled}
              title={adminOnlyTitle}
            >
              {WATERMARK_OPACITIES.map((o) => (
                <option key={o} value={o}>
                  {WATERMARK_OPACITY_LABELS[o]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Placement" htmlFor="wm-layer">
            <Select
              id="wm-layer"
              value={wmLayer}
              onChange={(e) => setWmLayer(e.target.value as WatermarkLayer)}
              disabled={!isEngAdmin || !wmEnabled}
              title={adminOnlyTitle}
            >
              {WATERMARK_LAYERS.map((l) => (
                <option key={l} value={l}>
                  {WATERMARK_LAYER_LABELS[l]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Button
          onClick={saveReport}
          loading={update.isPending}
          disabled={!isEngAdmin}
          title={adminOnlyTitle}
        >
          Save report details
        </Button>
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
