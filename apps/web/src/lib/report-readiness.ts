/**
 * Report readiness: the checklist of content a report must have before it's
 * considered "ready to generate". Shared by the Content tab's progress checklist
 * (computed from live form state) and the Generate tab's gate (computed from the
 * saved engagement), so both agree on what "ready" means.
 *
 * This is intentionally UI-only: readiness never blocks the API, it only warns —
 * see the Generate tab's confirm-before-generate flow.
 */

const nonEmpty = (s: string | null | undefined): boolean => Boolean(s && s.trim());

/** The normalized values every readiness item is evaluated against. */
export interface ReadinessInput {
  clientName: string;
  assessmentType: string;
  location: string;
  scope: string;
  executiveSummary: string;
  methodology: string;
  watermarkEnabled: boolean;
  scopeTargets: { name: string }[];
  recommendations: { title: string; findingUuids?: string[] }[];
  threatModelNarrative: string;
  threatModelDiagrams: { imageDataUri: string }[];
  executionNarrative: { title: string }[];
  providerContacts: { name: string }[];
  clientContacts: { name: string }[];
  thirdPartySoftware: { name: string }[];
  /** How many findings are currently marked "Ready to report". */
  readyFindingCount: number;
}

/** Static metadata for one readiness item (order = display order). */
interface ReadinessItemDef {
  key: string;
  label: string;
  /**
   * DOM id in the Content tab to scroll to when the row is activated. Omitted for
   * items that live outside the Content form (e.g. the ready-finding gate, which
   * points at the Findings tab instead).
   */
  anchor?: string;
  /** Whether the item's underlying content is present. */
  complete: (i: ReadinessInput) => boolean;
}

/** Every readiness item, in the order the user listed them. */
export const READINESS_ITEMS: ReadinessItemDef[] = [
  { key: 'clientName', label: 'Client / organization name', anchor: 'r-client', complete: (i) => nonEmpty(i.clientName) },
  { key: 'assessmentType', label: 'Assessment type', anchor: 'r-type', complete: (i) => nonEmpty(i.assessmentType) },
  { key: 'location', label: 'Location / environment', anchor: 'r-location', complete: (i) => nonEmpty(i.location) },
  { key: 'scope', label: 'Additional scope notes', anchor: 'sec-service-scope', complete: (i) => nonEmpty(i.scope) },
  { key: 'executiveSummary', label: 'Executive summary', anchor: 'r-exec', complete: (i) => nonEmpty(i.executiveSummary) },
  { key: 'methodology', label: 'Methodology', anchor: 'r-method', complete: (i) => nonEmpty(i.methodology) },
  { key: 'watermark', label: 'Watermark', anchor: 'wm-text', complete: (i) => i.watermarkEnabled },
  {
    key: 'serviceScope',
    label: 'Service scope',
    anchor: 'sec-service-scope',
    complete: (i) => i.scopeTargets.some((t) => nonEmpty(t.name)),
  },
  {
    key: 'recommendations',
    label: 'Strategic recommendations',
    anchor: 'sec-recommendations',
    // ≥1 recommendation, and every (title-bearing) recommendation is linked to a finding.
    complete: (i) => {
      const valid = i.recommendations.filter((r) => nonEmpty(r.title));
      return valid.length > 0 && valid.every((r) => (r.findingUuids?.length ?? 0) > 0);
    },
  },
  {
    key: 'threatModel',
    label: 'Threat model',
    anchor: 'sec-threat-model',
    complete: (i) =>
      nonEmpty(i.threatModelNarrative) ||
      i.threatModelDiagrams.some((d) => d.imageDataUri.startsWith('data:image/')),
  },
  {
    key: 'assessmentExecution',
    label: 'Assessment execution',
    anchor: 'sec-assessment-execution',
    complete: (i) => i.executionNarrative.some((s) => nonEmpty(s.title)),
  },
  {
    key: 'providerContacts',
    label: 'Provider contacts',
    anchor: 'sec-provider-contacts',
    complete: (i) => i.providerContacts.some((c) => nonEmpty(c.name)),
  },
  {
    key: 'clientContacts',
    label: 'Client contacts',
    anchor: 'sec-client-contacts',
    complete: (i) => i.clientContacts.some((c) => nonEmpty(c.name)),
  },
  {
    key: 'testTools',
    label: 'Test tools used',
    anchor: 'sec-test-tools',
    complete: (i) => i.thirdPartySoftware.some((s) => nonEmpty(s.name)),
  },
  {
    key: 'readyFinding',
    label: 'At least one finding marked “Ready to report”',
    // Lives on the Findings tab, not the Content form.
    complete: (i) => i.readyFindingCount > 0,
  },
];

/** One evaluated readiness item. */
export interface ReadinessItem {
  key: string;
  label: string;
  anchor?: string;
  /** The content is present. */
  complete: boolean;
  /** The author explicitly marked this item "Not applicable". */
  na: boolean;
  /** complete || na — counts toward "ready". */
  satisfied: boolean;
}

export interface ReadinessResult {
  items: ReadinessItem[];
  /** Number of satisfied (complete or N/A) items. */
  satisfiedCount: number;
  total: number;
  /** Every item is satisfied. */
  ready: boolean;
  /** Satisfied ÷ total, 0–100 (integer). */
  percent: number;
}

/** Evaluate readiness for the given content + the set of item keys marked N/A. */
export function computeReadiness(input: ReadinessInput, naKeys: readonly string[]): ReadinessResult {
  const na = new Set(naKeys);
  const items: ReadinessItem[] = READINESS_ITEMS.map((def) => {
    const complete = def.complete(input);
    const isNa = na.has(def.key);
    return {
      key: def.key,
      label: def.label,
      anchor: def.anchor,
      complete,
      na: isNa,
      // An item that is genuinely complete shouldn't also read as "N/A".
      satisfied: complete || isNa,
    };
  });
  const satisfiedCount = items.filter((i) => i.satisfied).length;
  const total = items.length;
  return {
    items,
    satisfiedCount,
    total,
    ready: satisfiedCount === total,
    percent: total === 0 ? 100 : Math.round((satisfiedCount / total) * 100),
  };
}
