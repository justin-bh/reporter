import { useState, type ReactNode } from 'react';
import { Badge, Button, Card, Checkbox, Field, Input, Select, Spinner, Textarea } from '@reporter/ui';
import {
  EVIDENCE_GROUPINGS,
  EVIDENCE_GROUPING_LABELS,
  EXECUTION_SUBSECTION_KIND_HINTS,
  EXECUTION_SUBSECTION_KIND_LABELS,
  type Contact,
  type EvidenceGrouping,
  type Evidence,
  type ExecutionEvidenceRef,
  type ExecutionSubsection,
  type ExecutionTimelineConfig,
  type RecommendationItem,
  type ScopeTarget,
  type SoftwareItem,
  type ThreatDiagram,
} from '@reporter/shared';
import { RepeatableList } from '../common/RepeatableList.js';
import { EvidencePickerModal } from '../findings/EvidencePickerModal.js';
import { TagsFilter } from '../evidence/filters/TagsFilter.js';
import { TypeFilter } from '../evidence/filters/TypeFilter.js';
import { useEvidence, useTags } from '../../api/hooks.js';
import { evidenceHeading } from '../../lib/evidence-label.js';
import { SaveStatusIndicator } from '../SaveStatusIndicator.js';
import type { SaveStatus } from '../../hooks/useAutosave.js';

/** A fresh timeline-subsection filter config (all-inclusive, chronological). */
const DEFAULT_TIMELINE_CONFIG: ExecutionTimelineConfig = {
  tags: [],
  types: [],
  group: 'chronological',
  includeComments: false,
  starredOnly: false,
};

// Threat-model diagram limits (mirrors the server's ~2 MB/image cap; see the
// shared threatDiagramSchema). base64 inflates ~33%, so a ~2 MB data URI ≈ 1.5 MB
// of raw file — we validate on the raw File.size below.
const MAX_DIAGRAM_BYTES = 2_000_000;
const MAX_DIAGRAMS = 12;
const DIAGRAM_ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp';

function readFileAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

interface Common {
  disabled: boolean;
  disabledTitle?: string;
  /** Flush the debounced autosave now (wire to text-input onBlur). */
  onFlush?: () => void;
}

/**
 * The structured Report v2 content editors. Presentational + controlled: each
 * section is a value/onChange pair driven by the settings page's local state and
 * persisted via its save handler. Rendered only for engagement admins; the
 * `disabled` flag mirrors the page's read-only gating.
 */
export function ReportContentEditors({
  slug,
  disabled,
  disabledTitle,
  scopeTargets,
  onScopeTargets,
  scopeExclusions,
  onScopeExclusions,
  recommendations,
  onRecommendations,
  threatModelNarrative,
  onThreatModelNarrative,
  threatModelDiagrams,
  onThreatModelDiagrams,
  executionNarrative,
  onExecutionNarrative,
  providerContacts,
  onProviderContacts,
  clientContacts,
  onClientContacts,
  softwareTested,
  onSoftwareTested,
  thirdPartySoftware,
  onThirdPartySoftware,
  status,
  onFlush,
}: Common & {
  slug: string;
  scopeTargets: ScopeTarget[];
  onScopeTargets: (v: ScopeTarget[]) => void;
  scopeExclusions: string[];
  onScopeExclusions: (v: string[]) => void;
  recommendations: RecommendationItem[];
  onRecommendations: (v: RecommendationItem[]) => void;
  threatModelNarrative: string;
  onThreatModelNarrative: (v: string) => void;
  threatModelDiagrams: ThreatDiagram[];
  onThreatModelDiagrams: (v: ThreatDiagram[]) => void;
  executionNarrative: ExecutionSubsection[];
  onExecutionNarrative: (v: ExecutionSubsection[]) => void;
  providerContacts: Contact[];
  onProviderContacts: (v: Contact[]) => void;
  clientContacts: Contact[];
  onClientContacts: (v: Contact[]) => void;
  softwareTested: SoftwareItem[];
  onSoftwareTested: (v: SoftwareItem[]) => void;
  thirdPartySoftware: SoftwareItem[];
  onThirdPartySoftware: (v: SoftwareItem[]) => void;
  /** Autosave status shown in the footer (replaces the manual Save button). */
  status: SaveStatus;
  /** Flush the debounced autosave immediately (called on field blur). */
  onFlush?: () => void;
}) {
  const common: Common = { disabled, disabledTitle, onFlush };

  return (
    <>
      <ScopeEditor
        {...common}
        targets={scopeTargets}
        onTargets={onScopeTargets}
        exclusions={scopeExclusions}
        onExclusions={onScopeExclusions}
      />

      <RecommendationsEditor
        {...common}
        items={recommendations}
        onChange={onRecommendations}
      />

      <ThreatModelEditor
        {...common}
        narrative={threatModelNarrative}
        onNarrative={onThreatModelNarrative}
        diagrams={threatModelDiagrams}
        onDiagrams={onThreatModelDiagrams}
      />

      <ExecutionEditor
        {...common}
        slug={slug}
        subsections={executionNarrative}
        onChange={onExecutionNarrative}
      />

      <ContactsEditor
        {...common}
        title="Provider contacts"
        hint="Assessment-team members listed in the report front matter."
        idPrefix="prov"
        items={providerContacts}
        onChange={onProviderContacts}
      />

      <ContactsEditor
        {...common}
        title="Client contacts"
        hint="Client-side points of contact for the engagement."
        idPrefix="cli"
        items={clientContacts}
        onChange={onClientContacts}
      />

      <SoftwareEditor
        {...common}
        title="Client software tested"
        hint="Software and versions in scope for the assessment."
        idPrefix="cst"
        items={softwareTested}
        onChange={onSoftwareTested}
      />

      <SoftwareEditor
        {...common}
        title="3rd-party software used"
        hint="Tooling used by the assessment team, with versions."
        idPrefix="tps"
        items={thirdPartySoftware}
        onChange={onThirdPartySoftware}
      />

      <Card className="flex items-center justify-between p-4 lg:col-span-2">
        <p className="text-sm text-muted">
          Structured report content autosaves together with the other report details.
        </p>
        {!disabled && <SaveStatusIndicator status={status} />}
      </Card>
    </>
  );
}

function SectionCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Card className="space-y-4 p-4 lg:col-span-2">
      <div>
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}

// --- Service Scope ---------------------------------------------------------

function ScopeEditor({
  disabled,
  disabledTitle,
  targets,
  onTargets,
  exclusions,
  onExclusions,
}: Common & {
  targets: ScopeTarget[];
  onTargets: (v: ScopeTarget[]) => void;
  exclusions: string[];
  onExclusions: (v: string[]) => void;
}) {
  return (
    <SectionCard
      title="Service scope"
      hint="Targets and their in-scope subsystems, plus anything explicitly out of scope."
    >
      <div>
        <p className="mb-2 text-sm font-medium text-text">Targets</p>
        <RepeatableList
          items={targets}
          onChange={onTargets}
          disabled={disabled}
          disabledTitle={disabledTitle}
          addLabel="Add target"
          emptyHint="No targets yet — add the systems or assets in scope."
          newItem={() => ({ name: '', subsystems: [] })}
          renderRow={(target, update) => (
            <div className="space-y-2">
              <Field label="Target name" htmlFor="scope-target-name">
                <Input
                  value={target.name}
                  onChange={(e) => update({ ...target, name: e.target.value })}
                  disabled={disabled}
                  title={disabledTitle}
                  placeholder="e.g. Telematics unit"
                />
              </Field>
              <div>
                <p className="mb-1 text-xs font-medium text-muted">Subsystems</p>
                <RepeatableList
                  items={target.subsystems}
                  onChange={(subsystems) => update({ ...target, subsystems })}
                  disabled={disabled}
                  disabledTitle={disabledTitle}
                  addLabel="Add subsystem"
                  emptyHint="No subsystems listed."
                  newItem={() => ''}
                  renderRow={(sub, updateSub) => (
                    <Input
                      value={sub}
                      onChange={(e) => updateSub(e.target.value)}
                      disabled={disabled}
                      title={disabledTitle}
                      aria-label="Subsystem"
                      placeholder="e.g. CAN gateway"
                    />
                  )}
                />
              </div>
            </div>
          )}
        />
      </div>

      <div className="border-t border-border pt-4">
        <p className="mb-2 text-sm font-medium text-text">Scope exclusions</p>
        <RepeatableList
          items={exclusions}
          onChange={onExclusions}
          disabled={disabled}
          disabledTitle={disabledTitle}
          addLabel="Add exclusion"
          emptyHint="Nothing explicitly excluded."
          newItem={() => ''}
          renderRow={(item, update) => (
            <Input
              value={item}
              onChange={(e) => update(e.target.value)}
              disabled={disabled}
              title={disabledTitle}
              aria-label="Scope exclusion"
              placeholder="e.g. Third-party cloud infrastructure"
            />
          )}
        />
      </div>
    </SectionCard>
  );
}

// --- Strategic Recommendations --------------------------------------------

function RecommendationsEditor({
  disabled,
  disabledTitle,
  items,
  onChange,
}: Common & {
  items: RecommendationItem[];
  onChange: (v: RecommendationItem[]) => void;
}) {
  return (
    <SectionCard
      title="Strategic recommendations"
      hint="High-level guidance, numbered R1, R2, … in the report."
    >
      <RepeatableList
        items={items}
        onChange={onChange}
        disabled={disabled}
        disabledTitle={disabledTitle}
        addLabel="Add recommendation"
        emptyHint="No recommendations yet."
        newItem={() => ({ title: '', description: '' })}
        renderRow={(item, update, index) => (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge tone="accent">R{index + 1}</Badge>
            </div>
            <Field label="Title" htmlFor={`rec-title-${index}`}>
              <Input
                id={`rec-title-${index}`}
                value={item.title}
                onChange={(e) => update({ ...item, title: e.target.value })}
                disabled={disabled}
                title={disabledTitle}
              />
            </Field>
            <Field label="Description" htmlFor={`rec-desc-${index}`}>
              <Textarea
                id={`rec-desc-${index}`}
                rows={3}
                value={item.description}
                onChange={(e) => update({ ...item, description: e.target.value })}
                disabled={disabled}
                title={disabledTitle}
              />
            </Field>
          </div>
        )}
      />
    </SectionCard>
  );
}

// --- Threat Model ----------------------------------------------------------

function ThreatModelEditor({
  disabled,
  disabledTitle,
  onFlush,
  narrative,
  onNarrative,
  diagrams,
  onDiagrams,
}: Common & {
  narrative: string;
  onNarrative: (v: string) => void;
  diagrams: ThreatDiagram[];
  onDiagrams: (v: ThreatDiagram[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function addDiagram(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (diagrams.length >= MAX_DIAGRAMS) {
      setError(`You can add up to ${MAX_DIAGRAMS} diagrams.`);
      return;
    }
    if (file.size > MAX_DIAGRAM_BYTES) {
      setError('That image is too large — keep each diagram under 2 MB.');
      return;
    }
    try {
      const imageDataUri = await readFileAsDataUri(file);
      if (!imageDataUri.startsWith('data:image/')) {
        setError('That file is not an image.');
        return;
      }
      onDiagrams([...diagrams, { imageDataUri, caption: '' }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the image');
    }
  }

  return (
    <SectionCard
      title="Threat model"
      hint="A narrative plus optional diagrams embedded in the report."
    >
      <Field label="Threat model narrative" htmlFor="tm-narrative">
        <Textarea
          id="tm-narrative"
          rows={6}
          value={narrative}
          onChange={(e) => onNarrative(e.target.value)}
          onBlur={onFlush}
          disabled={disabled}
          title={disabledTitle}
        />
      </Field>

      <div className="border-t border-border pt-4">
        <p className="mb-1 text-sm font-medium text-text">Diagrams</p>
        <p className="mb-3 text-xs text-muted">
          PNG or SVG, ~1600px wide, under 2 MB each. Up to {MAX_DIAGRAMS} diagrams.
        </p>
        <RepeatableList
          items={diagrams}
          onChange={onDiagrams}
          disabled={disabled}
          disabledTitle={disabledTitle}
          addLabel="Add diagram"
          emptyHint="No diagrams yet."
          // The "add" button appends a blank slot; the file picker in the row
          // fills its image. This keeps a consistent add/reorder/remove UX.
          newItem={() => ({ imageDataUri: '', caption: '' })}
          renderRow={(diagram, update, index) => (
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex h-20 w-28 items-center justify-center overflow-hidden rounded-input border border-border bg-surface-2">
                {diagram.imageDataUri ? (
                  <img
                    src={diagram.imageDataUri}
                    alt={diagram.caption || `Diagram ${index + 1} preview`}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="px-2 text-center text-xs text-muted">No image</span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  type="file"
                  accept={DIAGRAM_ACCEPT}
                  aria-label={`Upload diagram ${index + 1}`}
                  disabled={disabled}
                  title={disabledTitle}
                  onChange={async (e) => {
                    setError(null);
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    if (file.size > MAX_DIAGRAM_BYTES) {
                      setError('That image is too large — keep each diagram under 2 MB.');
                      return;
                    }
                    try {
                      const imageDataUri = await readFileAsDataUri(file);
                      if (!imageDataUri.startsWith('data:image/')) {
                        setError('That file is not an image.');
                        return;
                      }
                      update({ ...diagram, imageDataUri });
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Could not read the image');
                    }
                  }}
                  className="block text-sm text-muted file:mr-3 file:rounded-input file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text hover:file:bg-surface disabled:opacity-50"
                />
                <Field label="Caption" htmlFor={`tm-cap-${index}`}>
                  <Input
                    id={`tm-cap-${index}`}
                    value={diagram.caption}
                    onChange={(e) => update({ ...diagram, caption: e.target.value })}
                    disabled={disabled}
                    title={disabledTitle}
                    placeholder="Describe the diagram"
                  />
                </Field>
              </div>
            </div>
          )}
        />
        {/* A quick-add file picker for appending diagrams with an image in one step. */}
        {diagrams.length < MAX_DIAGRAMS && (
          <div className="mt-2">
            <label className="text-xs text-muted">
              Or add a diagram directly:{' '}
              <input
                type="file"
                accept={DIAGRAM_ACCEPT}
                aria-label="Add a diagram"
                disabled={disabled}
                title={disabledTitle}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  void addDiagram(file);
                }}
                className="text-sm text-muted file:mr-3 file:rounded-input file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text hover:file:bg-surface disabled:opacity-50"
              />
            </label>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
    </SectionCard>
  );
}

// --- Assessment Execution narrative ---------------------------------------

function ExecutionEditor({
  disabled,
  disabledTitle,
  slug,
  subsections,
  onChange,
}: Common & {
  slug: string;
  subsections: ExecutionSubsection[];
  onChange: (v: ExecutionSubsection[]) => void;
}) {
  const newNarrative = (): ExecutionSubsection => ({
    kind: 'narrative',
    title: '',
    body: '',
    evidence: [],
  });
  const newTimeline = (): ExecutionSubsection => ({
    kind: 'timeline',
    title: '',
    body: '',
    evidence: [],
    timeline: { ...DEFAULT_TIMELINE_CONFIG },
  });

  return (
    <SectionCard
      title="Assessment execution"
      hint="Written narrative subsections with embedded evidence, or activity timelines drawn from the engagement’s captured evidence."
    >
      <RepeatableList
        items={subsections}
        onChange={onChange}
        disabled={disabled}
        disabledTitle={disabledTitle}
        addLabel="Add subsection"
        emptyHint="No execution subsections yet."
        newItem={newNarrative}
        addSlot={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={disabled}
              title={disabledTitle}
              onClick={() => onChange([...subsections, newNarrative()])}
            >
              ＋ Add narrative
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={disabled}
              title={disabledTitle}
              onClick={() => onChange([...subsections, newTimeline()])}
            >
              ＋ Add timeline
            </Button>
          </div>
        }
        renderRow={(sub, update, index) => {
          const kind = sub.kind === 'timeline' ? 'timeline' : 'narrative';
          return (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge tone={kind === 'timeline' ? 'accent' : 'neutral'}>
                  {EXECUTION_SUBSECTION_KIND_LABELS[kind]}
                </Badge>
                <span className="text-xs text-muted">{EXECUTION_SUBSECTION_KIND_HINTS[kind]}</span>
              </div>
              <Field label="Subsection title" htmlFor={`ex-title-${index}`}>
                <Input
                  id={`ex-title-${index}`}
                  value={sub.title}
                  onChange={(e) => update({ ...sub, title: e.target.value })}
                  disabled={disabled}
                  title={disabledTitle}
                  placeholder={
                    kind === 'timeline' ? 'e.g. CAN bus activity' : 'e.g. CAN bus analysis'
                  }
                />
              </Field>
              {kind === 'timeline' ? (
                <ExecutionTimelineEditor
                  slug={slug}
                  index={index}
                  disabled={disabled}
                  disabledTitle={disabledTitle}
                  config={sub.timeline}
                  onChange={(timeline) => update({ ...sub, timeline })}
                />
              ) : (
                <>
                  <Field label="Body" htmlFor={`ex-body-${index}`}>
                    <Textarea
                      id={`ex-body-${index}`}
                      rows={5}
                      value={sub.body}
                      onChange={(e) => update({ ...sub, body: e.target.value })}
                      disabled={disabled}
                      title={disabledTitle}
                    />
                  </Field>
                  <ExecutionEvidenceEditor
                    slug={slug}
                    disabled={disabled}
                    disabledTitle={disabledTitle}
                    refs={sub.evidence}
                    onChange={(evidence) => update({ ...sub, evidence })}
                  />
                </>
              )}
            </div>
          );
        }}
      />
    </SectionCard>
  );
}

/** Filters + grouping for a timeline-kind execution subsection. */
function ExecutionTimelineEditor({
  slug,
  index,
  disabled,
  disabledTitle,
  config,
  onChange,
}: Common & {
  slug: string;
  /** Row position — keeps this editor's control ids unique across subsections. */
  index: number;
  config: ExecutionTimelineConfig | undefined;
  onChange: (v: ExecutionTimelineConfig) => void;
}) {
  const { data: tags = [] } = useTags(slug);
  const cfg = config ?? DEFAULT_TIMELINE_CONFIG;
  const groupId = `ex-tl-group-${index}`;
  return (
    <div className="space-y-3 rounded-card border border-dashed border-border p-3">
      <p className="text-xs font-medium text-muted">
        Renders the engagement’s captured evidence, filtered and grouped — no hand-picked evidence.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Group by" htmlFor={groupId}>
          <Select
            id={groupId}
            value={cfg.group}
            disabled={disabled}
            title={disabledTitle}
            onChange={(e) => onChange({ ...cfg, group: e.target.value as EvidenceGrouping })}
          >
            {EVIDENCE_GROUPINGS.map((g) => (
              <option key={g} value={g}>
                {EVIDENCE_GROUPING_LABELS[g]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-center gap-2 pb-0.5">
          <TagsFilter value={cfg.tags} tags={tags} onChange={(t) => onChange({ ...cfg, tags: t })} />
          <TypeFilter value={cfg.types} onChange={(t) => onChange({ ...cfg, types: t })} />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Checkbox
          label="Include follow-up comments"
          checked={cfg.includeComments}
          disabled={disabled}
          onChange={(e) => onChange({ ...cfg, includeComments: e.target.checked })}
        />
        <Checkbox
          label="Only starred evidence"
          checked={cfg.starredOnly}
          disabled={disabled}
          onChange={(e) => onChange({ ...cfg, starredOnly: e.target.checked })}
        />
      </div>
    </div>
  );
}

function ExecutionEvidenceEditor({
  slug,
  disabled,
  disabledTitle,
  refs,
  onChange,
}: Common & {
  slug: string;
  refs: ExecutionEvidenceRef[];
  onChange: (v: ExecutionEvidenceRef[]) => void;
}) {
  const [picking, setPicking] = useState(false);
  const existingUuids = refs.map((r) => r.evidenceUuid);

  function onPick(picked: Evidence[]) {
    const seen = new Set(existingUuids);
    const additions = picked
      .filter((e) => !seen.has(e.uuid))
      .map<ExecutionEvidenceRef>((e) => ({ evidenceUuid: e.uuid, caption: '' }));
    onChange([...refs, ...additions]);
    setPicking(false);
  }

  return (
    <div className="rounded-card border border-dashed border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-muted">Embedded evidence ({refs.length})</p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setPicking(true)}
          disabled={disabled}
          title={disabledTitle}
        >
          Add evidence
        </Button>
      </div>

      <RepeatableList
        items={refs}
        onChange={onChange}
        disabled={disabled}
        disabledTitle={disabledTitle}
        addLabel="Add evidence"
        emptyHint="No evidence embedded in this subsection yet."
        // Rows are only added via the picker, so surface that instead of a blank
        // ref: the RepeatableList "add" button appends an empty (invalid) ref.
        newItem={() => ({ evidenceUuid: '', caption: '' })}
        renderRow={(ref, update, index) => (
          <ExecutionEvidenceRow
            slug={slug}
            evidenceRef={ref}
            index={index}
            disabled={disabled}
            disabledTitle={disabledTitle}
            onCaption={(caption) => update({ ...ref, caption })}
          />
        )}
      />

      <EvidencePickerModal
        slug={slug}
        attachedUuids={existingUuids}
        targetInPath={false}
        open={picking}
        onClose={() => setPicking(false)}
        onPick={onPick}
      />
    </div>
  );
}

function ExecutionEvidenceRow({
  slug,
  evidenceRef,
  index,
  disabled,
  disabledTitle,
  onCaption,
}: Common & {
  slug: string;
  evidenceRef: ExecutionEvidenceRef;
  index: number;
  onCaption: (caption: string) => void;
}) {
  // Resolve the referenced evidence to show a label and detect stale refs (the
  // evidence was deleted, or the uuid slot is still empty). One query per row is
  // fine — the list is small and results are cached across renders.
  const { data, isLoading, isError } = useEvidence(slug, evidenceRef.evidenceUuid);
  const missing = !evidenceRef.evidenceUuid || isError;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        {isLoading ? (
          <Spinner size={14} />
        ) : missing ? (
          <Badge tone="warning">Missing evidence</Badge>
        ) : (
          <span className="min-w-0 truncate font-medium text-text">
            {data ? evidenceHeading(data) : <span className="text-muted">Evidence</span>}
          </span>
        )}
      </div>
      {missing && (
        <p className="text-xs text-warning">
          This evidence is no longer in the engagement and will be skipped in the report.
        </p>
      )}
      <Field label="Caption" htmlFor={`ex-ev-cap-${index}`}>
        <Input
          id={`ex-ev-cap-${index}`}
          value={evidenceRef.caption}
          onChange={(e) => onCaption(e.target.value)}
          disabled={disabled}
          title={disabledTitle}
          placeholder="Optional caption"
        />
      </Field>
    </div>
  );
}

// --- Contacts --------------------------------------------------------------

function ContactsEditor({
  disabled,
  disabledTitle,
  title,
  hint,
  idPrefix,
  items,
  onChange,
}: Common & {
  title: string;
  hint: string;
  idPrefix: string;
  items: Contact[];
  onChange: (v: Contact[]) => void;
}) {
  return (
    <SectionCard title={title} hint={hint}>
      <RepeatableList
        items={items}
        onChange={onChange}
        disabled={disabled}
        disabledTitle={disabledTitle}
        addLabel="Add contact"
        emptyHint="No contacts yet."
        newItem={() => ({ name: '', title: '', email: '' })}
        renderRow={(contact, update, index) => (
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Name" htmlFor={`${idPrefix}-name-${index}`}>
              <Input
                id={`${idPrefix}-name-${index}`}
                value={contact.name}
                onChange={(e) => update({ ...contact, name: e.target.value })}
                disabled={disabled}
                title={disabledTitle}
              />
            </Field>
            <Field label="Title" htmlFor={`${idPrefix}-title-${index}`}>
              <Input
                id={`${idPrefix}-title-${index}`}
                value={contact.title}
                onChange={(e) => update({ ...contact, title: e.target.value })}
                disabled={disabled}
                title={disabledTitle}
              />
            </Field>
            <Field label="Email" htmlFor={`${idPrefix}-email-${index}`}>
              <Input
                id={`${idPrefix}-email-${index}`}
                type="email"
                value={contact.email}
                onChange={(e) => update({ ...contact, email: e.target.value })}
                disabled={disabled}
                title={disabledTitle}
              />
            </Field>
          </div>
        )}
      />
    </SectionCard>
  );
}

// --- Software --------------------------------------------------------------

function SoftwareEditor({
  disabled,
  disabledTitle,
  title,
  hint,
  idPrefix,
  items,
  onChange,
}: Common & {
  title: string;
  hint: string;
  idPrefix: string;
  items: SoftwareItem[];
  onChange: (v: SoftwareItem[]) => void;
}) {
  return (
    <SectionCard title={title} hint={hint}>
      <RepeatableList
        items={items}
        onChange={onChange}
        disabled={disabled}
        disabledTitle={disabledTitle}
        addLabel="Add software"
        emptyHint="No software listed yet."
        newItem={() => ({ name: '', version: '' })}
        renderRow={(item, update, index) => (
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Name" htmlFor={`${idPrefix}-name-${index}`}>
              <Input
                id={`${idPrefix}-name-${index}`}
                value={item.name}
                onChange={(e) => update({ ...item, name: e.target.value })}
                disabled={disabled}
                title={disabledTitle}
              />
            </Field>
            <Field label="Version" htmlFor={`${idPrefix}-ver-${index}`}>
              <Input
                id={`${idPrefix}-ver-${index}`}
                value={item.version}
                onChange={(e) => update({ ...item, version: e.target.value })}
                disabled={disabled}
                title={disabledTitle}
              />
            </Field>
          </div>
        )}
      />
    </SectionCard>
  );
}
