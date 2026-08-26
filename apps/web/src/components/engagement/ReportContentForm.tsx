import { useEffect, useRef, useState } from 'react';
import { Card, Checkbox, Field, Input, MarkdownField, Select } from '@reporter/ui';
import {
  WATERMARK_LAYERS,
  WATERMARK_LAYER_LABELS,
  WATERMARK_MAX_CHARS,
  WATERMARK_OPACITIES,
  WATERMARK_OPACITY_LABELS,
  type Contact,
  type Engagement,
  type ExecutionSubsection,
  type RecommendationItem,
  type ScopeTarget,
  type SoftwareItem,
  type ThreatDiagram,
  type WatermarkLayer,
  type WatermarkOpacity,
} from '@reporter/shared';
import { useUpdateEngagement } from '../../api/hooks.js';
import { useAutosave } from '../../hooks/useAutosave.js';
import { SaveStatusIndicator } from '../SaveStatusIndicator.js';
import { ReportContentEditors } from './ReportContentEditors.js';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * The slice of engagement fields that describe the report's *content* — the
 * report-detail metadata, the watermark, and the structured Report v2 sections.
 * This is the set moved out of the engagement Settings page into the Reports tab's
 * "Content" sub-tab; it owns its own debounced autosave over the same engagement
 * record (the Settings page keeps the details/members/tags slice).
 */
interface ContentForm {
  clientName: string;
  assessmentType: string;
  location: string;
  scope: string;
  executiveSummary: string;
  methodology: string;
  wmEnabled: boolean;
  wmText: string;
  wmColor: string;
  wmOpacity: WatermarkOpacity;
  wmLayer: WatermarkLayer;
  scopeTargets: ScopeTarget[];
  scopeExclusions: string[];
  recommendations: RecommendationItem[];
  threatModelNarrative: string;
  threatModelDiagrams: ThreatDiagram[];
  executionNarrative: ExecutionSubsection[];
  providerContacts: Contact[];
  clientContacts: Contact[];
  softwareTested: SoftwareItem[];
  thirdPartySoftware: SoftwareItem[];
}

/**
 * Self-contained, autosaving editor for an engagement's report content. Seeds its
 * own form state from the passed engagement and PUTs partial `updateEngagementInput`
 * patches through {@link useUpdateEngagement}. `canWrite` gates every input into a
 * read-only view (mirroring the old Settings page's `disabled` behavior).
 */
export function ReportContentForm({
  slug,
  engagement: eng,
  canWrite,
}: {
  slug: string;
  engagement: Engagement;
  canWrite: boolean;
}) {
  const disabled = !canWrite;
  const disabledTitle = disabled ? 'You need write access to edit this.' : undefined;

  const [form, setForm] = useState<ContentForm>({
    clientName: '',
    assessmentType: '',
    location: '',
    scope: '',
    executiveSummary: '',
    methodology: '',
    wmEnabled: true,
    wmText: '',
    wmColor: '#64748b',
    wmOpacity: 'medium',
    wmLayer: 'behind',
    scopeTargets: [],
    scopeExclusions: [],
    recommendations: [],
    threatModelNarrative: '',
    threatModelDiagrams: [],
    executionNarrative: [],
    providerContacts: [],
    clientContacts: [],
    softwareTested: [],
    thirdPartySoftware: [],
  });
  const patchForm = <K extends keyof ContentForm>(key: K, value: ContentForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Seed once per engagement, not on every cache change — membership/favorite
  // mutations replace the cached `eng` object, and reseeding then would clobber an
  // in-progress edit. (Mirrors the Settings page's seeding guard.)
  const seededSlug = useRef<string | null>(null);
  const [baseline, setBaseline] = useState<ContentForm | undefined>(undefined);
  useEffect(() => {
    if (seededSlug.current === eng.slug) return;
    seededSlug.current = eng.slug;
    const seeded: ContentForm = {
      clientName: eng.clientName ?? '',
      assessmentType: eng.assessmentType ?? '',
      location: eng.location ?? '',
      scope: eng.scope ?? '',
      executiveSummary: eng.executiveSummary ?? '',
      methodology: eng.methodology ?? '',
      wmEnabled: eng.watermarkEnabled ?? true,
      // Clamp to the current cap so an engagement that saved a longer watermark
      // under the old limit doesn't block autosave of the whole form.
      wmText: (eng.watermarkText ?? '').slice(0, WATERMARK_MAX_CHARS),
      wmColor: eng.watermarkColor ?? '#64748b',
      wmOpacity: eng.watermarkOpacity ?? 'medium',
      wmLayer: eng.watermarkLayer ?? 'behind',
      scopeTargets: eng.scopeTargets ?? [],
      scopeExclusions: eng.scopeExclusions ?? [],
      recommendations: eng.strategicRecommendations ?? [],
      threatModelNarrative: eng.threatModelNarrative ?? '',
      threatModelDiagrams: eng.threatModelDiagrams ?? [],
      executionNarrative: eng.executionNarrative ?? [],
      providerContacts: eng.providerContacts ?? [],
      clientContacts: eng.clientContacts ?? [],
      softwareTested: eng.softwareTested ?? [],
      thirdPartySoftware: eng.thirdPartySoftware ?? [],
    };
    setForm(seeded);
    setBaseline(seeded);
  }, [eng]);

  // The watermark color must be a #rrggbb hex or the server 400s; a dirty-but-
  // invalid form parks at `unsaved` and never saves.
  const colorInvalid = !HEX_COLOR_RE.test(form.wmColor);
  const formValid = (v: ContentForm) => HEX_COLOR_RE.test(v.wmColor);

  const update = useUpdateEngagement(slug);
  const { status, flush } = useAutosave<ContentForm>({
    value: form,
    baseline,
    isValid: (v) => canWrite && formValid(v),
    save: async (v) => {
      const orNull = (s: string) => (s.trim() === '' ? null : s);
      const trim = (s: string) => s.trim();
      const nonEmpty = (s: string) => trim(s) !== '';
      await update.mutateAsync({
        // Report metadata — empty string clears the field (sent as null).
        clientName: orNull(v.clientName),
        assessmentType: orNull(v.assessmentType),
        location: orNull(v.location),
        scope: orNull(v.scope),
        executiveSummary: orNull(v.executiveSummary),
        methodology: orNull(v.methodology),
        watermarkEnabled: v.wmEnabled,
        // Slice defensively so a legacy over-long value can never 400 the patch.
        watermarkText: orNull(v.wmText.slice(0, WATERMARK_MAX_CHARS)),
        watermarkColor: v.wmColor,
        watermarkOpacity: v.wmOpacity,
        watermarkLayer: v.wmLayer,
        // Structured report content — drop blank rows the same way the manual save did.
        scopeTargets: v.scopeTargets
          .filter((t) => nonEmpty(t.name))
          .map((t) => ({ name: trim(t.name), subsystems: t.subsystems.filter(nonEmpty) })),
        scopeExclusions: v.scopeExclusions.filter(nonEmpty),
        strategicRecommendations: v.recommendations.filter((r) => nonEmpty(r.title)),
        threatModelNarrative: nonEmpty(v.threatModelNarrative) ? v.threatModelNarrative : null,
        threatModelDiagrams: v.threatModelDiagrams.filter((d) =>
          d.imageDataUri.startsWith('data:image/'),
        ),
        executionNarrative: v.executionNarrative
          .filter((s) => nonEmpty(s.title))
          .map((s) => ({ ...s, evidence: s.evidence.filter((e) => e.evidenceUuid !== '') })),
        providerContacts: v.providerContacts.filter(
          (c) => nonEmpty(c.name) || nonEmpty(c.title) || nonEmpty(c.email),
        ),
        clientContacts: v.clientContacts.filter(
          (c) => nonEmpty(c.name) || nonEmpty(c.title) || nonEmpty(c.email),
        ),
        softwareTested: v.softwareTested.filter((s) => nonEmpty(s.name)),
        thirdPartySoftware: v.thirdPartySoftware.filter((s) => nonEmpty(s.name)),
      });
      setBaseline(v);
    },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4 p-4 lg:col-span-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-text">Report details</h3>
            <p className="mt-1 text-xs text-muted">
              Metadata for the exported report PDF. Leave a field blank to omit it.
            </p>
          </div>
          {!disabled && <SaveStatusIndicator status={status} />}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client / organization name" htmlFor="r-client">
            <Input
              id="r-client"
              value={form.clientName}
              onChange={(e) => patchForm('clientName', e.target.value)}
              onBlur={() => void flush()}
              disabled={disabled}
              title={disabledTitle}
            />
          </Field>
          <Field
            label="Assessment type"
            htmlFor="r-type"
            hint="e.g. External Penetration Assessment"
          >
            <Input
              id="r-type"
              value={form.assessmentType}
              onChange={(e) => patchForm('assessmentType', e.target.value)}
              onBlur={() => void flush()}
              disabled={disabled}
              title={disabledTitle}
            />
          </Field>
        </div>
        <Field label="Location / environment" htmlFor="r-location">
          <Input
            id="r-location"
            value={form.location}
            onChange={(e) => patchForm('location', e.target.value)}
            onBlur={() => void flush()}
            disabled={disabled}
            title={disabledTitle}
          />
        </Field>
        <Field
          label="Scope notes"
          htmlFor="r-scope"
          hint="Optional free-text notes. Use the structured Service scope section below for the report’s scope tables."
        >
          <MarkdownField
            id="r-scope"
            rows={3}
            value={form.scope}
            onChange={(v) => patchForm('scope', v)}
            onBlur={() => void flush()}
            disabled={disabled}
            title={disabledTitle}
          />
        </Field>
        <Field label="Executive summary" htmlFor="r-exec">
          <MarkdownField
            id="r-exec"
            rows={5}
            value={form.executiveSummary}
            onChange={(v) => patchForm('executiveSummary', v)}
            onBlur={() => void flush()}
            disabled={disabled}
            title={disabledTitle}
          />
        </Field>
        <Field label="Methodology" htmlFor="r-method">
          <MarkdownField
            id="r-method"
            rows={5}
            value={form.methodology}
            onChange={(v) => patchForm('methodology', v)}
            onBlur={() => void flush()}
            disabled={disabled}
            title={disabledTitle}
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
          checked={form.wmEnabled}
          disabled={disabled}
          onChange={(e) => patchForm('wmEnabled', e.target.checked)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Watermark text"
            htmlFor="wm-text"
            hint={`Defaults to CONFIDENTIAL. Up to ${WATERMARK_MAX_CHARS} characters.`}
          >
            <Input
              id="wm-text"
              value={form.wmText}
              placeholder="CONFIDENTIAL"
              maxLength={WATERMARK_MAX_CHARS}
              onChange={(e) => patchForm('wmText', e.target.value)}
              onBlur={() => void flush()}
              disabled={disabled || !form.wmEnabled}
              title={disabledTitle}
            />
          </Field>
          <Field
            label="Color"
            htmlFor="wm-color"
            error={!disabled && form.wmEnabled && colorInvalid ? 'Use a #rrggbb hex color.' : undefined}
          >
            <div className="flex items-center gap-2">
              <input
                type="color"
                id="wm-color"
                aria-label="Watermark color"
                value={colorInvalid ? '#64748b' : form.wmColor}
                onChange={(e) => patchForm('wmColor', e.target.value)}
                onBlur={() => void flush()}
                disabled={disabled || !form.wmEnabled}
                className="h-9 w-12 shrink-0 rounded-input border border-border bg-surface disabled:opacity-50"
              />
              <Input
                value={form.wmColor}
                onChange={(e) => patchForm('wmColor', e.target.value)}
                onBlur={() => void flush()}
                invalid={!disabled && form.wmEnabled && colorInvalid}
                disabled={disabled || !form.wmEnabled}
                title={disabledTitle}
                className="font-mono"
                aria-label="Watermark color hex"
              />
            </div>
          </Field>
          <Field label="Transparency" htmlFor="wm-opacity">
            <Select
              id="wm-opacity"
              value={form.wmOpacity}
              onChange={(e) => patchForm('wmOpacity', e.target.value as WatermarkOpacity)}
              disabled={disabled || !form.wmEnabled}
              title={disabledTitle}
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
              value={form.wmLayer}
              onChange={(e) => patchForm('wmLayer', e.target.value as WatermarkLayer)}
              disabled={disabled || !form.wmEnabled}
              title={disabledTitle}
            >
              {WATERMARK_LAYERS.map((l) => (
                <option key={l} value={l}>
                  {WATERMARK_LAYER_LABELS[l]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <ReportContentEditors
        slug={slug}
        disabled={disabled}
        disabledTitle={disabledTitle}
        status={disabled ? 'idle' : status}
        onFlush={() => void flush()}
        scopeTargets={form.scopeTargets}
        onScopeTargets={(v) => patchForm('scopeTargets', v)}
        scopeExclusions={form.scopeExclusions}
        onScopeExclusions={(v) => patchForm('scopeExclusions', v)}
        recommendations={form.recommendations}
        onRecommendations={(v) => patchForm('recommendations', v)}
        threatModelNarrative={form.threatModelNarrative}
        onThreatModelNarrative={(v) => patchForm('threatModelNarrative', v)}
        threatModelDiagrams={form.threatModelDiagrams}
        onThreatModelDiagrams={(v) => patchForm('threatModelDiagrams', v)}
        executionNarrative={form.executionNarrative}
        onExecutionNarrative={(v) => patchForm('executionNarrative', v)}
        providerContacts={form.providerContacts}
        onProviderContacts={(v) => patchForm('providerContacts', v)}
        clientContacts={form.clientContacts}
        onClientContacts={(v) => patchForm('clientContacts', v)}
        softwareTested={form.softwareTested}
        onSoftwareTested={(v) => patchForm('softwareTested', v)}
        thirdPartySoftware={form.thirdPartySoftware}
        onThirdPartySoftware={(v) => patchForm('thirdPartySoftware', v)}
      />
    </div>
  );
}
