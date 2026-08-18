import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Select,
  SeverityBadge,
  Spinner,
  Textarea,
  useConfirm,
  useToast,
} from '@reporter/ui';
import { SEVERITIES, SEVERITY_LABELS, type Severity } from '@reporter/shared';
import {
  useCreateFindingCategory,
  useDeleteFinding,
  useFinding,
  useFindingCategories,
  useUpdateFinding,
} from '../api/hooks.js';
import { READ_ONLY_TITLE, useEngagementPermissions } from '../lib/permissions.js';
import { CvssCalculator, type CvssResult } from '../components/findings/CvssCalculator.js';
import { AttackPathSection } from '../components/findings/AttackPathSection.js';
import { AttachedEvidenceSection } from '../components/findings/AttachedEvidenceSection.js';
import { EvidencePickerModal } from '../components/findings/EvidencePickerModal.js';

export function FindingDetailPage() {
  const { slug = '', uuid = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: finding, isLoading } = useFinding(slug, uuid);
  const { canWrite } = useEngagementPermissions(slug);
  const update = useUpdateFinding(slug, uuid);
  const del = useDeleteFinding(slug);
  const { data: categories } = useFindingCategories(slug);
  const createCategory = useCreateFindingCategory(slug);
  // Which bucket the picker attaches into, or null when closed.
  const [pickerTarget, setPickerTarget] = useState<null | 'path' | 'attached'>(null);
  const [calc, setCalc] = useState(false);
  // Inline "new category" affordance next to the category Select.
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    readyToReport: false,
    severity: '' as Severity | '',
    cvssVector: null as string | null,
    cvssScore: null as number | null,
  });

  // Seed the form once per finding, not on every cache change. Optimistic
  // evidence reorder/attach/detach replace the cached `finding` object; without
  // this guard the effect would re-run and silently discard unsaved edits.
  const seededUuid = useRef<string | null>(null);
  useEffect(() => {
    if (finding && seededUuid.current !== finding.uuid) {
      seededUuid.current = finding.uuid;
      setForm({
        title: finding.title,
        description: finding.description,
        category: finding.category ?? '',
        readyToReport: finding.readyToReport,
        severity: finding.severity ?? '',
        cvssVector: finding.cvssVector,
        cvssScore: finding.cvssScore,
      });
    }
  }, [finding]);

  if (isLoading) return <Spinner size={26} />;
  if (!finding) return <p className="text-danger">Finding not found.</p>;

  // Read-only pattern: inputs disable along with their save buttons.
  const readOnlyTitle = canWrite ? undefined : READ_ONLY_TITLE;

  // Server pre-sorts: Attack Path (inPath=true) first, then Attached, each by position.
  const pathItems = finding.evidence.filter((e) => e.inPath);
  const attachedItems = finding.evidence.filter((e) => !e.inPath);
  const attachedUuids = finding.evidence.map((e) => e.uuid);

  async function save() {
    try {
      const patch: Record<string, unknown> = {
        title: form.title,
        description: form.description,
        category: form.category || null,
        readyToReport: form.readyToReport,
      };
      if (form.cvssVector) {
        // A CVSS vector is set — the server derives score + severity from it.
        patch.cvssVector = form.cvssVector;
      } else {
        // No vector: record the manual severity (or clear it) and drop any vector.
        patch.severity = form.severity === '' ? null : form.severity;
        patch.cvssVector = null;
      }
      await update.mutateAsync(patch);
      toast.success('Finding updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  }

  // Picking a severity manually invalidates any stored CVSS vector.
  function pickSeverity(value: Severity | '') {
    setForm((prev) => ({ ...prev, severity: value, cvssVector: null, cvssScore: null }));
  }

  function applyCvss(result: CvssResult) {
    setForm((prev) => ({
      ...prev,
      severity: result.severity,
      cvssVector: result.vector,
      cvssScore: result.score,
    }));
    setCalc(false);
  }

  async function addCategory() {
    const category = newCategory.trim();
    if (!category) return;
    try {
      await createCategory.mutateAsync({ category });
      setForm((prev) => ({ ...prev, category }));
      setNewCategory('');
      setAddingCategory(false);
      toast.success('Category created');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create category');
    }
  }

  async function removeFinding() {
    if (!finding) return;
    const ok = await confirm({
      title: 'Delete finding',
      message: `Delete “${finding.title}”? Attached evidence is kept; this can’t be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await del.mutateAsync(finding.uuid);
      toast.success('Finding deleted');
      navigate(`/engagements/${slug}/findings`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to={`/engagements/${slug}/findings`} className="text-sm text-muted hover:text-text">
          ← Back to findings
        </Link>
        <Button
          variant="ghost"
          onClick={removeFinding}
          className="text-danger"
          disabled={!canWrite}
          title={canWrite ? undefined : READ_ONLY_TITLE}
        >
          Delete finding
        </Button>
      </div>

      {/* Finding details — top, roomy. */}
      <Card className="space-y-4 p-4">
        <Field label="Title" htmlFor="ft">
          <Input
            id="ft"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            disabled={!canWrite}
            title={readOnlyTitle}
          />
        </Field>
        <Field label="Category" htmlFor="fc">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              id="fc"
              className="max-w-[16rem]"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              disabled={!canWrite}
              title={readOnlyTitle}
            >
              <option value="">No category</option>
              {/* Preserve a soft-deleted category still on this finding. */}
              {form.category &&
                !(categories ?? []).some((c) => c.category === form.category) && (
                  <option value={form.category}>{form.category}</option>
                )}
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.category}>
                  {c.category}
                </option>
              ))}
            </Select>
            {addingCategory ? (
              <span className="flex items-center gap-2">
                <Input
                  aria-label="New category name"
                  className="max-w-[12rem]"
                  autoFocus
                  disabled={!canWrite}
                  title={readOnlyTitle}
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void addCategory();
                    } else if (e.key === 'Escape') {
                      setAddingCategory(false);
                      setNewCategory('');
                    }
                  }}
                  placeholder="Category name"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={addCategory}
                  loading={createCategory.isPending}
                  disabled={!newCategory.trim()}
                >
                  Add
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAddingCategory(false);
                    setNewCategory('');
                  }}
                >
                  Cancel
                </Button>
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setAddingCategory(true)}
                disabled={!canWrite}
                title={canWrite ? undefined : READ_ONLY_TITLE}
              >
                ＋ New
              </Button>
            )}
          </div>
        </Field>

        <Field label="Severity" htmlFor="fsev">
          <div className="flex items-center gap-2">
            <Select
              id="fsev"
              className="max-w-[10rem]"
              value={form.severity}
              onChange={(e) => pickSeverity(e.target.value as Severity | '')}
              disabled={!canWrite}
              title={readOnlyTitle}
            >
              <option value="">Unrated</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_LABELS[s]}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setCalc(true)}
              disabled={!canWrite}
              title={readOnlyTitle}
            >
              CVSS calculator
            </Button>
            {form.cvssVector && (
              <SeverityBadge severity={form.severity || null} score={form.cvssScore} />
            )}
          </div>
        </Field>
        {form.cvssVector && (
          <p className="-mt-2 text-xs text-muted">
            <code>{form.cvssVector}</code>
          </p>
        )}

        <Field label="Description" htmlFor="fd">
          <Textarea
            id="fd"
            rows={6}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            disabled={!canWrite}
            title={readOnlyTitle}
          />
        </Field>
        <div className="flex items-center justify-between">
          <Checkbox
            label="Ready to report"
            checked={form.readyToReport}
            onChange={(e) => setForm({ ...form, readyToReport: e.target.checked })}
            disabled={!canWrite}
            title={readOnlyTitle}
          />
          <Button
            onClick={save}
            loading={update.isPending}
            disabled={!canWrite}
            title={canWrite ? undefined : READ_ONLY_TITLE}
          >
            Save changes
          </Button>
        </div>
      </Card>

      {/* Evidence — full width, two buckets below the details. */}
      <AttackPathSection
        slug={slug}
        findingUuid={uuid}
        items={pathItems}
        onAddStep={() => setPickerTarget('path')}
        canWrite={canWrite}
      />
      <AttachedEvidenceSection
        slug={slug}
        findingUuid={uuid}
        items={attachedItems}
        onAttach={() => setPickerTarget('attached')}
        canWrite={canWrite}
      />

      <CvssCalculator
        open={calc}
        onClose={() => setCalc(false)}
        initialVector={form.cvssVector}
        onApply={applyCvss}
      />
      <EvidencePickerModal
        slug={slug}
        findingUuid={uuid}
        attachedUuids={attachedUuids}
        targetInPath={pickerTarget === 'path'}
        open={pickerTarget !== null}
        onClose={() => setPickerTarget(null)}
      />
    </div>
  );
}
