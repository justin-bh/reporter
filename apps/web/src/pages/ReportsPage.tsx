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
  Select,
  Spinner,
  Textarea,
  useToast,
} from '@reporter/ui';
import {
  DEFAULT_REPORT_SECTIONS,
  EVIDENCE_GROUPINGS,
  EVIDENCE_GROUPING_LABELS,
  REPORT_PRESETS,
  REPORT_PRESET_HINTS,
  REPORT_PRESET_LABELS,
  REPORT_SECTION_HINTS,
  REPORT_SECTION_LABELS,
  reportConfigSchema,
  type EvidenceGrouping,
  type ReportConfig,
  type ReportCustomSection,
  type ReportPreset,
  type ReportSection,
  type ReportSectionEntry,
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
  const { canWrite } = useEngagementPermissions(slug);
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
    isValid: () => canWrite,
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
  const readOnly = !canWrite;

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
        {canWrite && <SaveStatusIndicator status={status} />}
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
                      return (
                        <SortableSectionRow
                          key={entry.key}
                          id={entry.key}
                          label={meta.label}
                          hint={meta.hint}
                          missing={meta.missing}
                          enabled={entry.enabled}
                          canWrite={canWrite}
                          onToggle={(v) => toggleSection(entry.key, v)}
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
                            <Textarea
                              id={`cs-body-${s.id}`}
                              rows={4}
                              value={s.body}
                              onChange={(e) => updateCustomSection(s.id, { body: e.target.value })}
                              onBlur={() => void flush()}
                              disabled={readOnly}
                            />
                          </Field>
                        </div>
                        {canWrite && (
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
  canWrite,
  onToggle,
}: {
  id: string;
  label: string;
  hint: string;
  missing: boolean;
  enabled: boolean;
  canWrite: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !canWrite,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

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
        disabled={!canWrite}
        aria-label={`Drag to reorder ${label}`}
        className="mt-0.5 cursor-grab touch-none px-1 text-muted hover:text-text active:cursor-grabbing disabled:opacity-50"
      >
        ⠿
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`truncate text-sm font-medium ${enabled ? 'text-text' : 'text-muted'}`}>
            {label}
          </p>
          {missing && <Badge tone="warning">Unknown</Badge>}
          {!enabled && <Badge tone="neutral">Hidden</Badge>}
        </div>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      <label className="mt-0.5 inline-flex cursor-pointer items-center">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          disabled={!canWrite}
          aria-label={`Include ${label}`}
          className="h-4 w-4 rounded border-border text-accent accent-[var(--accent)] disabled:opacity-50"
        />
      </label>
    </li>
  );
}
