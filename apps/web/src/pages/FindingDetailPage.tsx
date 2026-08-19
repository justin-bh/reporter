import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Badge,
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
import {
  FINDING_KINDS,
  FINDING_KIND_LABELS,
  FIX_EFFORTS,
  FIX_EFFORT_LABELS,
  ISO_21434_WORK_PRODUCTS,
  SEVERITIES,
  SEVERITY_LABELS,
  UN_R155_REQUIREMENTS,
  type FindingKind,
  type FixEffort,
  type Severity,
} from '@reporter/shared';
import { useDeleteFinding, useFinding, useUpdateFinding } from '../api/hooks.js';
import { READ_ONLY_TITLE, useEngagementPermissions } from '../lib/permissions.js';
import { CvssCalculator, type CvssResult } from '../components/findings/CvssCalculator.js';
import { AttackPathSection } from '../components/findings/AttackPathSection.js';
import { AttachedEvidenceSection } from '../components/findings/AttachedEvidenceSection.js';
import { EvidencePickerModal } from '../components/findings/EvidencePickerModal.js';
import { CategorySelect } from '../components/findings/CategorySelect.js';
import { StandardsPicker } from '../components/findings/StandardsPicker.js';

export function FindingDetailPage() {
  const { slug = '', uuid = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: finding, isLoading } = useFinding(slug, uuid);
  const { canWrite } = useEngagementPermissions(slug);
  const update = useUpdateFinding(slug, uuid);
  const del = useDeleteFinding(slug);
  // Which bucket the picker attaches into, or null when closed.
  const [pickerTarget, setPickerTarget] = useState<null | 'path' | 'attached'>(null);
  const [calc, setCalc] = useState(false);

  const [form, setForm] = useState({
    kind: 'weakness' as FindingKind,
    title: '',
    description: '',
    affectedTarget: '',
    impact: '',
    remediation: '',
    category: '',
    fixEffort: 'none' as FixEffort,
    iso21434Refs: [] as string[],
    unr155Refs: [] as string[],
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
        kind: finding.kind,
        title: finding.title,
        description: finding.description,
        affectedTarget: finding.affectedTarget,
        impact: finding.impact,
        remediation: finding.remediation,
        category: finding.category ?? '',
        fixEffort: finding.fixEffort,
        iso21434Refs: finding.iso21434Refs,
        unr155Refs: finding.unr155Refs,
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
  const isWeakness = form.kind === 'weakness';

  // Server pre-sorts: Attack Path (inPath=true) first, then Attached, each by position.
  const pathItems = finding.evidence.filter((e) => e.inPath);
  const attachedItems = finding.evidence.filter((e) => !e.inPath);
  const attachedUuids = finding.evidence.map((e) => e.uuid);

  async function save() {
    try {
      const patch: Record<string, unknown> = {
        kind: form.kind,
        title: form.title,
        description: form.description,
        affectedTarget: form.affectedTarget,
        category: form.category || null,
        readyToReport: form.readyToReport,
        iso21434Refs: form.iso21434Refs,
        unr155Refs: form.unr155Refs,
      };
      if (form.kind === 'weakness') {
        // Weaknesses carry the impact/remediation/effort and a severity or CVSS.
        patch.impact = form.impact;
        patch.remediation = form.remediation;
        patch.fixEffort = form.fixEffort;
        if (form.cvssVector) {
          // A CVSS vector is set — the server derives score + severity from it.
          patch.cvssVector = form.cvssVector;
        } else {
          // No vector: record the manual severity (or clear it) and drop any vector.
          patch.severity = form.severity === '' ? null : form.severity;
          patch.cvssVector = null;
        }
      } else {
        // Strengths have no severity/CVSS/impact/remediation/effort — clear them.
        patch.severity = null;
        patch.cvssVector = null;
        patch.impact = '';
        patch.remediation = '';
        patch.fixEffort = 'none';
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
        <Field
          label="Kind"
          htmlFor="fk"
          hint="Weaknesses carry severity and remediation; strengths note good practices."
        >
          <div id="fk" role="radiogroup" aria-label="Finding kind" className="flex gap-2">
            {FINDING_KINDS.map((k) => (
              <Button
                key={k}
                type="button"
                size="sm"
                variant={form.kind === k ? 'primary' : 'secondary'}
                role="radio"
                aria-checked={form.kind === k}
                onClick={() => setForm({ ...form, kind: k })}
                disabled={!canWrite}
                title={readOnlyTitle}
              >
                {FINDING_KIND_LABELS[k]}
              </Button>
            ))}
            {form.kind === 'strength' && <Badge tone="success">Strength</Badge>}
          </div>
        </Field>

        <Field label="Title" htmlFor="ft">
          <Input
            id="ft"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            disabled={!canWrite}
            title={readOnlyTitle}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="fc">
            <CategorySelect
              id="fc"
              slug={slug}
              value={form.category}
              onChange={(category) => setForm((prev) => ({ ...prev, category }))}
              disabled={!canWrite}
            />
          </Field>
          <Field
            label="Affected target"
            htmlFor="fat"
            hint="Component, host, or subsystem this finding concerns."
          >
            <Input
              id="fat"
              value={form.affectedTarget}
              onChange={(e) => setForm({ ...form, affectedTarget: e.target.value })}
              disabled={!canWrite}
              title={readOnlyTitle}
            />
          </Field>
        </div>

        {isWeakness && (
          <>
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
            <Field label="Fix effort" htmlFor="ffe" hint="Estimated effort to remediate.">
              <Select
                id="ffe"
                className="max-w-[10rem]"
                value={form.fixEffort}
                onChange={(e) => setForm({ ...form, fixEffort: e.target.value as FixEffort })}
                disabled={!canWrite}
                title={readOnlyTitle}
              >
                {FIX_EFFORTS.map((f) => (
                  <option key={f} value={f}>
                    {FIX_EFFORT_LABELS[f]}
                  </option>
                ))}
              </Select>
            </Field>
          </>
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

        {isWeakness && (
          <>
            <Field
              label="Impact"
              htmlFor="fimp"
              hint="Business or technical impact if exploited (distinct from the description)."
            >
              <Textarea
                id="fimp"
                rows={4}
                value={form.impact}
                onChange={(e) => setForm({ ...form, impact: e.target.value })}
                disabled={!canWrite}
                title={readOnlyTitle}
              />
            </Field>
            <Field
              label="Remediation"
              htmlFor="frem"
              hint="Recommended fix / guidance (shown in the report)."
            >
              <Textarea
                id="frem"
                rows={6}
                value={form.remediation}
                onChange={(e) => setForm({ ...form, remediation: e.target.value })}
                disabled={!canWrite}
                title={readOnlyTitle}
              />
            </Field>
          </>
        )}

        {/* Standards mapping — available for both kinds. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ISO/SAE 21434" htmlFor="fiso" hint="Related work products / clauses.">
            <StandardsPicker
              catalog={ISO_21434_WORK_PRODUCTS}
              value={form.iso21434Refs}
              onChange={(iso21434Refs) => setForm((prev) => ({ ...prev, iso21434Refs }))}
              disabled={!canWrite}
              disabledTitle={readOnlyTitle}
              label="ISO 21434 work product"
            />
          </Field>
          <Field label="UN R155" htmlFor="funr" hint="Related requirements / Annex 5 entries.">
            <StandardsPicker
              catalog={UN_R155_REQUIREMENTS}
              value={form.unr155Refs}
              onChange={(unr155Refs) => setForm((prev) => ({ ...prev, unr155Refs }))}
              disabled={!canWrite}
              disabledTitle={readOnlyTitle}
              label="UN R155 requirement"
            />
          </Field>
        </div>

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
