import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ErrorState,
  Field,
  Input,
  MarkdownField,
  Select,
  Spinner,
  useToast,
} from '@reporter/ui';
import {
  DEFAULT_REPORT_SECTIONS,
  EVIDENCE_GROUPINGS,
  EVIDENCE_GROUPING_LABELS,
  FINDING_GROUPINGS,
  FINDING_GROUPING_LABELS,
  REPORT_PRESETS,
  REPORT_PRESET_HINTS,
  REPORT_PRESET_LABELS,
  REPORT_SECTION_HINTS,
  REPORT_SECTION_ITEMS,
  REPORT_SECTION_LABELS,
  REPORT_SECTION_SAMPLE,
  reportConfigSchema,
  type EvidenceGrouping,
  type FindingGrouping,
  type ReportConfig,
  type ReportCustomSection,
  type ReportPreset,
  type ReportSection,
  type ReportSectionEntry,
  type ReportSectionItem,
} from '@reporter/shared';
import { useEngagement, useUpdateEngagement } from '../api/hooks.js';
import { useEngagementPermissions } from '../lib/permissions.js';
import { useAutosave } from '../hooks/useAutosave.js';
import { SaveStatusIndicator } from '../components/SaveStatusIndicator.js';
import { downloadFile } from '../lib/download.js';

/** Stable id for a custom section not yet given a real id. */
function makeCustomId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** The custom id encoded in a `custom:<id>` section key, or null for built-ins. */
function customIdOf(key: string): string | null {
  return key.startsWith('custom:') ? key.slice('custom:'.length) : null;
}

/** Human label + hint for a section entry (built-in or custom). */
function sectionMeta(
  entry: ReportSectionEntry,
  customSections: ReportCustomSection[],
): { label: string; hint: string; missing: boolean } {
  const cid = customIdOf(entry.key);
  if (cid) {
    const custom = customSections.find((c) => c.id === cid);
    return {
      label: custom?.title || 'Custom section',
      hint: 'A free-text section you authored below.',
      missing: !custom,
    };
  }
  const key = entry.key as ReportSection;
  return {
    label: REPORT_SECTION_LABELS[key] ?? entry.key,
    hint: REPORT_SECTION_HINTS[key] ?? '',
    missing: !(entry.key in REPORT_SECTION_LABELS),
  };
}

export function ReportsPage() {
  const { slug = '' } = useParams();
  const toast = useToast();
  // The report config is persisted via the engagement update endpoint, which is
  // admin-gated — so gate these controls on the engagement-admin role.
  const { canAdmin: canEdit } = useEngagementPermissions(slug);
  const { data: eng, isLoading, isError, refetch } = useEngagement(slug);

  // Seed the config form once per engagement (normalizing an empty config to the
  // canonical default), then autosave edits back through useUpdateEngagement.
  const seededSlug = useRef<string | null>(null);
  const [config, setConfig] = useState<ReportConfig>(() => reportConfigSchema.parse({}));
  const [baseline, setBaseline] = useState<ReportConfig | undefined>(undefined);
  useEffect(() => {
    if (eng && seededSlug.current !== eng.slug) {
      seededSlug.current = eng.slug;
      const seeded = reportConfigSchema.parse(eng.reportConfig ?? {});
      setConfig(seeded);
      setBaseline(seeded);
    }
  }, [eng]);

  const update = useUpdateEngagement(slug);
  const { status, flush } = useAutosave<ReportConfig>({
    value: config,
    baseline,
    isValid: () => canEdit,
    save: async (v) => {
      await update.mutateAsync({ reportConfig: v });
      setBaseline(v);
    },
  });

  const [busy, setBusy] = useState<'pdf' | 'zip' | 'json' | null>(null);
  // Report "type": `custom` renders the configured sections; the others are
  // canned subsets. Drives the exported filename (`<slug>-<type>-<time>.<ext>`).
  const [preset, setPreset] = useState<ReportPreset>('custom');

  async function generate(format: 'pdf' | 'zip' | 'json') {
    // Flush any pending config edit so the report reflects the latest options.
    await flush();
    setBusy(format);
    try {
      const url = `/web/engagements/${slug}/report.${format}?preset=${preset}`;
      // The server sets the authoritative filename (type + timestamp); this is
      // only a fallback if the Content-Disposition header is missing.
      await downloadFile(url, `${slug}-${preset}-report.${format}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const keys = config.sections.map((s) => s.key);
    const from = keys.indexOf(String(active.id));
    const to = keys.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    setConfig((c) => ({ ...c, sections: arrayMove(c.sections, from, to) }));
  }

  function toggleSection(key: string, enabled: boolean) {
    setConfig((c) => ({
      ...c,
      sections: c.sections.map((s) => (s.key === key ? { ...s, enabled } : s)),
    }));
  }

  // Which section rows are expanded to show their sample + sub-item toggles.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  function setSectionOption(key: string, itemKey: string, value: boolean) {
    setConfig((c) => ({
      ...c,
      sections: c.sections.map((s) =>
        s.key === key ? { ...s, options: { ...(s.options ?? {}), [itemKey]: value } } : s,
      ),
    }));
  }

  function resetSections() {
    setConfig((c) => {
      // Keep any custom sections at the end; reset built-ins to the default order.
      const customEntries = c.sections.filter((s) => customIdOf(s.key));
      return { ...c, sections: [...DEFAULT_REPORT_SECTIONS, ...customEntries] };
    });
  }

  // Custom sections
  function addCustomSection() {
    const id = makeCustomId();
    setConfig((c) => ({
      ...c,
      customSections: [...c.customSections, { id, title: 'New section', body: '' }],
      sections: [...c.sections, { key: `custom:${id}`, enabled: true }],
    }));
  }

  function updateCustomSection(id: string, patch: Partial<ReportCustomSection>) {
    setConfig((c) => ({
      ...c,
      customSections: c.customSections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  }

  function removeCustomSection(id: string) {
    setConfig((c) => ({
      ...c,
      customSections: c.customSections.filter((s) => s.id !== id),
      sections: c.sections.filter((s) => customIdOf(s.key) !== id),
    }));
  }

  const busyAny = busy !== null;
  const readOnly = !canEdit;

  const orderedKeys = useMemo(() => config.sections.map((s) => s.key), [config.sections]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-text">Reports</h2>
          <p className="text-sm text-muted">
            Choose which sections appear, reorder them, then generate the report.
          </p>
        </div>
        {canEdit && <SaveStatusIndicator status={status} />}
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError || !eng ? (
        <ErrorState description="Couldn’t load this engagement." onRetry={() => refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            {/* Section list */}
            <Card className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-text">Sections</h3>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={resetSections}
                  disabled={readOnly}
                >
                  Reset order
                </Button>
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                onDragEnd={onDragEnd}
              >
                <SortableContext items={orderedKeys} strategy={verticalListSortingStrategy}>
                  <ul className="flex flex-col gap-2">
                    {config.sections.map((entry) => {
                      const meta = sectionMeta(entry, config.customSections);
                      const isCustom = customIdOf(entry.key) !== null;
                      const isBuiltin = !isCustom && !meta.missing;
                      const rk = entry.key as ReportSection;
                      const sample = isBuiltin
                        ? REPORT_SECTION_SAMPLE[rk]
                        : isCustom
                          ? 'A free-text section you authored below.'
                          : undefined;
                      const items = isBuiltin ? REPORT_SECTION_ITEMS[rk] : undefined;
                      return (
                        <SortableSectionRow
                          key={entry.key}
                          id={entry.key}
                          label={meta.label}
                          hint={meta.hint}
                          missing={meta.missing}
                          enabled={entry.enabled}
                          canEdit={canEdit}
                          onToggle={(v) => toggleSection(entry.key, v)}
                          expanded={expanded.has(entry.key)}
                          onToggleExpand={() => toggleExpand(entry.key)}
                          sample={sample}
                          items={items}
                          options={entry.options}
                          onToggleOption={(itemKey, v) => setSectionOption(entry.key, itemKey, v)}
                        />
                      );
                    })}
                  </ul>
                </SortableContext>
              </DndContext>
            </Card>

            {/* Custom sections editor */}
            <Card className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-text">Custom sections</h3>
                  <p className="mt-0.5 text-xs text-muted">
                    Free-text sections inserted into the report flow. Each appears in the list above
                    as an enable/reorder entry.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={addCustomSection}
                  disabled={readOnly || config.customSections.length >= 30}
                >
                  Add section
                </Button>
              </div>
              {config.customSections.length === 0 ? (
                <p className="text-sm text-muted">No custom sections yet.</p>
              ) : (
                <div className="space-y-3">
                  {config.customSections.map((s) => (
                    <div key={s.id} className="rounded-card border border-border bg-surface-2 p-3">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 space-y-2">
                          <Field label="Title" htmlFor={`cs-title-${s.id}`}>
                            <Input
                              id={`cs-title-${s.id}`}
                              value={s.title}
                              onChange={(e) => updateCustomSection(s.id, { title: e.target.value })}
                              onBlur={() => void flush()}
                              disabled={readOnly}
                            />
                          </Field>
                          <Field label="Body" htmlFor={`cs-body-${s.id}`}>
                            <MarkdownField
                              id={`cs-body-${s.id}`}
                              rows={4}
                              value={s.body}
                              onChange={(v) => updateCustomSection(s.id, { body: v })}
                              onBlur={() => void flush()}
                              disabled={readOnly}
                            />
                          </Field>
                        </div>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => removeCustomSection(s.id)}
                            aria-label={`Remove section ${s.title}`}
                            title="Remove section"
                            className="px-1 text-muted hover:text-danger"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Options + generate */}
          <div className="space-y-4">
            <Card className="space-y-4 p-4">
              <h3 className="text-sm font-semibold text-text">Options</h3>
              <Checkbox
                label="Include all findings (not only “Ready to report”)"
                checked={config.includeAllFindings}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, includeAllFindings: e.target.checked }))
                }
                disabled={readOnly}
              />
              <Field
                label="Findings grouping"
                htmlFor="rp-finding-group"
                hint="How findings are ordered/grouped in the report"
              >
                <Select
                  id="rp-finding-group"
                  value={config.findingGroup}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      findingGroup: e.target.value as FindingGrouping,
                    }))
                  }
                  disabled={readOnly}
                >
                  {FINDING_GROUPINGS.map((g) => (
                    <option key={g} value={g}>
                      {FINDING_GROUPING_LABELS[g]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Checkbox
                label="Include the evidence timeline in Assessment Execution"
                checked={config.includeEvidenceTimeline}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, includeEvidenceTimeline: e.target.checked }))
                }
                disabled={readOnly}
              />
              {config.includeEvidenceTimeline && (
                <Field
                  label="Evidence timeline grouping"
                  htmlFor="rp-group"
                  hint="How the captured evidence is organized in the timeline."
                >
                  <Select
                    id="rp-group"
                    value={config.evidenceGroup}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        evidenceGroup: e.target.value as EvidenceGrouping,
                      }))
                    }
                    disabled={readOnly}
                  >
                    {EVIDENCE_GROUPINGS.map((g) => (
                      <option key={g} value={g}>
                        {EVIDENCE_GROUPING_LABELS[g]}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </Card>

            <Card className="space-y-3 p-4">
              <h3 className="text-sm font-semibold text-text">Generate</h3>
              <Field
                label="Report type"
                htmlFor="rp-preset"
                hint={REPORT_PRESET_HINTS[preset]}
              >
                <Select
                  id="rp-preset"
                  value={preset}
                  onChange={(e) => setPreset(e.target.value as ReportPreset)}
                >
                  {REPORT_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {REPORT_PRESET_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="text-xs text-muted">
                The ZIP bundle wraps the PDF with its supporting files; JSON exports the
                report-ready findings and can be re-imported later. The file is named for the report
                type and the moment it was generated.
              </p>
              <div className="flex flex-col gap-2">
                <Button onClick={() => generate('pdf')} loading={busy === 'pdf'} disabled={busyAny}>
                  Generate PDF
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => generate('zip')}
                  loading={busy === 'zip'}
                  disabled={busyAny}
                >
                  Generate ZIP bundle
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => generate('json')}
                  loading={busy === 'json'}
                  disabled={busyAny}
                >
                  Export JSON
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function SortableSectionRow({
  id,
  label,
  hint,
  missing,
  enabled,
  canEdit,
  onToggle,
  expanded,
  onToggleExpand,
  sample,
  items,
  options,
  onToggleOption,
}: {
  id: string;
  label: string;
  hint: string;
  missing: boolean;
  enabled: boolean;
  canEdit: boolean;
  onToggle: (enabled: boolean) => void;
  expanded: boolean;
  onToggleExpand: () => void;
  /** One-line preview of the whole section, shown when expanded. */
  sample?: string;
  /** Independently-toggleable sub-items, shown when expanded (built-ins only). */
  items?: ReportSectionItem[];
  /** Current sub-item overrides keyed by item id (absent/true = included). */
  options?: Record<string, boolean>;
  onToggleOption: (itemKey: string, value: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !canEdit,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const panelId = `section-panel-${id}`;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 rounded-card border border-border p-3 ${
        enabled ? 'bg-surface' : 'bg-surface-2'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        disabled={!canEdit}
        aria-label={`Drag to reorder ${label}`}
        className="mt-0.5 cursor-grab touch-none px-1 text-muted hover:text-text active:cursor-grabbing disabled:opacity-50"
      >
        ⠿
      </button>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="flex w-full items-start gap-2 text-left"
        >
          <span
            className={`mt-0.5 select-none text-xs text-muted transition-transform ${
              expanded ? 'rotate-90' : ''
            }`}
            aria-hidden="true"
          >
            ▶
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span
                className={`truncate text-sm font-medium ${enabled ? 'text-text' : 'text-muted'}`}
              >
                {label}
              </span>
              {missing && <Badge tone="warning">Unknown</Badge>}
              {!enabled && <Badge tone="neutral">Hidden</Badge>}
            </span>
            {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
          </span>
        </button>

        {expanded && (
          <div id={panelId} className="mt-2 space-y-2 border-t border-border pt-2 pl-6">
            {sample && <p className="text-xs text-muted">{sample}</p>}
            {items && items.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-text">Include in this section:</p>
                {items.map((it) => (
                  <label key={it.key} className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={options?.[it.key] !== false}
                      onChange={(e) => onToggleOption(it.key, e.target.checked)}
                      disabled={!canEdit || !enabled}
                      aria-label={`Include ${it.label}`}
                      className="mt-0.5 h-4 w-4 rounded border-border text-accent accent-[var(--accent)] disabled:opacity-50"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm text-text">{it.label}</span>
                      <span className="block text-xs text-muted">{it.sample}</span>
                    </span>
                  </label>
                ))}
                {!enabled && (
                  <p className="text-xs text-muted">Enable the section to include its parts.</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted">This section has no separately toggleable parts.</p>
            )}
          </div>
        )}
      </div>
      <label className="mt-0.5 inline-flex cursor-pointer items-center">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          disabled={!canEdit}
          aria-label={`Include ${label}`}
          className="h-4 w-4 rounded border-border text-accent accent-[var(--accent)] disabled:opacity-50"
        />
      </label>
    </li>
  );
}
