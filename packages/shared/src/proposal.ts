/**
 * Proposal import: a lenient reader for the JSON produced by the proposal-
 * generation tool, and a pure mapper that turns it into an engagement "import
 * draft" (metadata + a Target → Activity → Goal tree). The mapper is shared so
 * the web app can preview an import client-side and the server can apply the same
 * (possibly edited) draft — one source of truth for the 1-to-1 translation.
 */
import { z } from 'zod';
import { contactSchema, isoDateSchema } from './schemas.js';

// ---------------------------------------------------------------------------
// Lenient proposal shape — every field optional, unknown keys passed through, so
// a partial or future proposal export still imports what it can.
// ---------------------------------------------------------------------------

const proposalContactSchema = z
  .object({
    name: z.string().optional().default(''),
    title: z.string().optional().default(''),
    email: z.string().optional().default(''),
  })
  .passthrough();

const proposalInterfaceSchema = z
  .object({
    name: z.string().optional().default(''),
    category: z.string().optional().default(''),
    subItems: z.array(z.string()).optional().default([]),
  })
  .passthrough();

const proposalDeviceSchema = z
  .object({
    name: z.string().optional().default(''),
    function: z.string().optional().default(''),
    interfaces: z.array(proposalInterfaceSchema).optional().default([]),
  })
  .passthrough();

const proposalExclusionSchema = z
  .object({ text: z.string().optional().default(''), checked: z.boolean().optional() })
  .passthrough();

export const proposalSchema = z
  .object({
    companyName: z.string().optional(),
    testType: z.string().optional(),
    testApproach: z.string().optional(),
    engagementGoals: z.string().optional(),
    scopeDescription: z.string().optional(),
    estimatedStartDate: z.string().optional(),
    locationOption: z.string().optional(),
    customLocation: z.string().optional(),
    clientContacts: z.array(proposalContactSchema).optional(),
    blockHarborContacts: z.array(proposalContactSchema).optional(),
    scopeExclusions: z.array(proposalExclusionSchema).optional(),
    devices: z.array(proposalDeviceSchema).optional(),
  })
  .passthrough();
export type Proposal = z.infer<typeof proposalSchema>;

// ---------------------------------------------------------------------------
// Import draft — the normalized, editable shape the import endpoint accepts.
// ---------------------------------------------------------------------------

export const importGoalSchema = z.object({
  title: z.string().min(1).max(500),
  isRetest: z.boolean().default(false),
});
export type ImportGoal = z.infer<typeof importGoalSchema>;

export const importActivitySchema = z.object({
  name: z.string().min(1).max(255),
  category: z.string().max(120).default(''),
  goals: z.array(importGoalSchema).max(500).default([]),
});
export type ImportActivity = z.infer<typeof importActivitySchema>;

export const importTargetSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(10_000).default(''),
  activities: z.array(importActivitySchema).max(200).default([]),
});
export type ImportTarget = z.infer<typeof importTargetSchema>;

export const importMetadataSchema = z.object({
  clientName: z.string().max(255).optional(),
  assessmentType: z.string().max(255).optional(),
  testApproach: z.string().max(255).optional(),
  objectivesNarrative: z.string().max(20_000).optional(),
  scope: z.string().max(20_000).optional(),
  location: z.string().max(255).optional(),
  startedAt: isoDateSchema.optional(),
  scopeExclusions: z.array(z.string().max(500)).max(200).optional(),
  providerContacts: z.array(contactSchema).max(50).optional(),
  clientContacts: z.array(contactSchema).max(50).optional(),
});
export type ImportMetadata = z.infer<typeof importMetadataSchema>;

export const importDraftSchema = z.object({
  metadata: importMetadataSchema.default({}),
  targets: z.array(importTargetSchema).max(200).default([]),
});
export type ImportDraft = z.infer<typeof importDraftSchema>;

/** Body of the proposal-import endpoint (a draft plus how to apply it). */
export const importRequestSchema = z.object({
  draft: importDraftSchema,
  /** `replace` clears existing targets first; `merge` appends. */
  mode: z.enum(['merge', 'replace']).default('merge'),
  /** Apply the metadata fields to the engagement (name/scope/contacts/…). */
  applyMetadata: z.boolean().default(true),
  /** The raw proposal JSON, stored verbatim for provenance. */
  rawProposal: z.unknown().optional(),
});
export type ImportRequest = z.infer<typeof importRequestSchema>;

export const importResultSchema = z.object({
  targetsCreated: z.number().int().nonnegative(),
  activitiesCreated: z.number().int().nonnegative(),
  goalsCreated: z.number().int().nonnegative(),
  metadataApplied: z.boolean(),
});
export type ImportResult = z.infer<typeof importResultSchema>;

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/** A "W1-…", "W12 …" style sub-item is a retest carried over from a prior report. */
export function isRetestTitle(title: string): boolean {
  return /^W\d+/.test(title.trim());
}

/** Coerce a date-only ("2026-09-30") or datetime string to an offset ISO string. */
function toIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (!v) return undefined;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function mapContacts(
  list: { name: string; title: string; email: string }[] | undefined,
): { name: string; title: string; email: string }[] | undefined {
  if (!list) return undefined;
  const mapped = list
    .map((c) => ({ name: c.name.trim(), title: c.title.trim(), email: c.email.trim() }))
    .filter((c) => c.name || c.title || c.email);
  return mapped.length ? mapped : undefined;
}

/**
 * Turn a (possibly partial) proposal JSON into a normalized import draft. Empty
 * targets/activities/goals are dropped; unknown fields are ignored. Always
 * returns a schema-valid draft (best-effort — never throws on odd input).
 */
export function proposalToImportDraft(raw: unknown): ImportDraft {
  const parsed = proposalSchema.safeParse(raw);
  const p: Proposal = parsed.success ? parsed.data : {};

  const targets = (p.devices ?? [])
    .map((d) => ({
      name: (d.name ?? '').trim(),
      description: (d.function ?? '').trim(),
      activities: (d.interfaces ?? [])
        .map((i) => ({
          name: (i.name ?? '').trim(),
          category: (i.category ?? '').trim(),
          goals: (i.subItems ?? [])
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
            .map((title) => ({ title, isRetest: isRetestTitle(title) })),
        }))
        .filter((a) => a.name.length > 0),
    }))
    .filter((t) => t.name.length > 0);

  // The proposal lists candidate exclusions with a `checked` flag; only the ones
  // the author actually selected are real scope exclusions. Drop those explicitly
  // unchecked; keep any where the flag is absent (older/partial exports).
  const scopeExclusions = (p.scopeExclusions ?? [])
    .filter((e) => e.checked !== false)
    .map((e) => (e.text ?? '').trim())
    .filter((t) => t.length > 0);

  const metadata: ImportMetadata = {};
  const set = (k: keyof ImportMetadata, v: string | undefined) => {
    const t = v?.trim();
    if (t) (metadata as Record<string, unknown>)[k] = t;
  };
  set('clientName', p.companyName);
  set('assessmentType', p.testType);
  set('testApproach', p.testApproach);
  set('objectivesNarrative', p.engagementGoals);
  set('scope', p.scopeDescription);
  set('location', (p.customLocation ?? '').trim() || p.locationOption);
  const startedAt = toIsoDate(p.estimatedStartDate);
  if (startedAt) metadata.startedAt = startedAt;
  if (scopeExclusions.length) metadata.scopeExclusions = scopeExclusions;
  const provider = mapContacts(p.blockHarborContacts);
  if (provider) metadata.providerContacts = provider;
  const client = mapContacts(p.clientContacts);
  if (client) metadata.clientContacts = client;

  // Normalize through the schema so callers always get a valid, defaulted draft.
  return importDraftSchema.parse({ metadata, targets });
}

/** A suggested engagement name from the proposal ("<company> — <test type>"). */
export function proposalSuggestedName(raw: unknown): string {
  const parsed = proposalSchema.safeParse(raw);
  const p: Proposal = parsed.success ? parsed.data : {};
  const bits = [p.companyName?.trim(), p.testType?.trim()].filter((s): s is string => Boolean(s));
  return bits.join(' — ');
}
