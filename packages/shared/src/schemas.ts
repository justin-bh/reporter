import { z } from 'zod';
import {
  EVIDENCE_TYPES,
  WATERMARK_MAX_CHARS,
  evidenceTypeSchema,
  engagementRoleSchema,
  engagementStatusSchema,
  evidenceGroupingSchema,
  findingGroupingSchema,
  executionSubsectionKindSchema,
  goalStatusSchema,
  savedQueryTypeSchema,
  severitySchema,
  fixEffortSchema,
  findingKindSchema,
  watermarkLayerSchema,
  watermarkOpacitySchema,
  type ReportPreset,
} from './enums.js';
import { cvssVectorSchema } from './cvss.js';

/** A URL-safe slug: lowercase alphanumerics and hyphens. */
export const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be lowercase alphanumerics separated by hyphens');

export const uuidSchema = z.string().uuid();
export const isoDateSchema = z.string().datetime({ offset: true });

// ---------------------------------------------------------------------------
// Structured report content (engagement-level; stored as JSON, edited in Settings)
//
// These item shapes back the JSON columns on an engagement. They are validated on
// write (updateEngagementInput) and returned on the engagement-detail read shape.
// Rendered into the exported PDF; each list defaults to empty.
// ---------------------------------------------------------------------------

/** A strategic recommendation shown in the report (numbered R1, R2, …). */
export const recommendationItemSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(10_000).default(''),
});
export type RecommendationItem = z.infer<typeof recommendationItemSchema>;

/** A scope target and its in-scope subsystems (rendered as the Service Scope). */
export const scopeTargetSchema = z.object({
  name: z.string().min(1).max(255),
  subsystems: z.array(z.string().max(255)).max(200).default([]),
});
export type ScopeTarget = z.infer<typeof scopeTargetSchema>;

/** A person listed in the report front-matter (provider or client side). Fields
 *  are lenient (any may be blank) so contacts can be entered incrementally. */
export const contactSchema = z.object({
  name: z.string().max(255).default(''),
  title: z.string().max(255).default(''),
  email: z.string().max(320).default(''),
});
export type Contact = z.infer<typeof contactSchema>;

/** A piece of software with its version (client software tested / 3rd-party used). */
export const softwareItemSchema = z.object({
  name: z.string().min(1).max(255),
  version: z.string().max(120).default(''),
});
export type SoftwareItem = z.infer<typeof softwareItemSchema>;

/**
 * A threat-model diagram: an inline image data URI plus a caption. Capped at
 * ~2 MB of base64 per image (recommend PNG/SVG ≲1600px wide) so a handful of
 * diagrams still embed cleanly in the exported PDF.
 */
export const threatDiagramSchema = z.object({
  imageDataUri: z
    .string()
    .max(2_800_000)
    .regex(/^data:image\/(png|jpeg|jpg|webp|svg\+xml|gif);base64,/, 'must be an image data URI'),
  caption: z.string().max(500).default(''),
});
export type ThreatDiagram = z.infer<typeof threatDiagramSchema>;

/**
 * A reference from an Assessment Execution subsection to a piece of the
 * engagement's evidence, by uuid, with an optional caption. Resolved at render
 * time; refs whose evidence no longer exists are skipped.
 */
export const executionEvidenceRefSchema = z.object({
  evidenceUuid: uuidSchema,
  caption: z.string().max(2000).default(''),
});
export type ExecutionEvidenceRef = z.infer<typeof executionEvidenceRefSchema>;

/**
 * Filters for a `timeline`-kind Assessment Execution subsection: it renders the
 * engagement's captured evidence (not hand-picked), narrowed and grouped. Empty
 * `tags`/`types` mean "no restriction". `starred` is resolved against the user
 * generating the report.
 */
export const executionTimelineConfigSchema = z.object({
  /** Restrict to evidence carrying all of these tags (empty = any tag). */
  tags: z.array(z.string().max(64)).max(50).default([]),
  /** Restrict to these evidence content types (empty = any type). */
  types: z.array(evidenceTypeSchema).max(EVIDENCE_TYPES.length).default([]),
  /** How items are grouped in the report (chronological / by tag / by type). */
  group: evidenceGroupingSchema.default('chronological'),
  /** Include follow-up comment evidence; default shows only top-level items. */
  includeComments: z.boolean().default(false),
  /** Only include evidence the report's author has starred. */
  starredOnly: z.boolean().default(false),
});
export type ExecutionTimelineConfig = z.infer<typeof executionTimelineConfigSchema>;

/**
 * One titled subsection of the Assessment Execution narrative. A `narrative`
 * subsection (the default and legacy shape) groups hand-authored prose plus
 * embedded evidence by topic/interface; a `timeline` subsection instead renders
 * a filtered, grouped view of the engagement's captured evidence (see
 * `timeline`). Legacy rows lack `kind` and parse as `narrative`.
 */
export const executionSubsectionSchema = z.object({
  kind: executionSubsectionKindSchema.default('narrative'),
  title: z.string().min(1).max(255),
  // Narrative fields: present for `narrative`; ignored (and empty) for `timeline`.
  body: z.string().max(20_000).default(''),
  evidence: z.array(executionEvidenceRefSchema).max(200).default([]),
  // Timeline config: present for `timeline` subsections.
  timeline: executionTimelineConfigSchema.optional(),
});
export type ExecutionSubsection = z.infer<typeof executionSubsectionSchema>;

// ---------------------------------------------------------------------------
// Report composition config (per-engagement; drives the Reports section)
// ---------------------------------------------------------------------------

/** A free-text custom section a user can insert into the report flow. */
export const reportCustomSectionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(255),
  body: z.string().max(50_000).default(''),
});
export type ReportCustomSection = z.infer<typeof reportCustomSectionSchema>;

/**
 * One entry in the ordered report section list. `key` is a built-in
 * `ReportSection` value or `custom:<id>` referencing a `customSections` entry.
 */
export const reportSectionEntrySchema = z.object({
  key: z.string().min(1).max(80),
  enabled: z.boolean().default(true),
  /**
   * Per-section sub-item toggles, keyed by the item ids in `REPORT_SECTION_ITEMS`.
   * An absent key (or `true`) includes that piece; `false` excludes it. Only
   * meaningful for built-in sections that expose sub-items; ignored otherwise.
   */
  options: z.record(z.boolean()).optional(),
});
export type ReportSectionEntry = z.infer<typeof reportSectionEntrySchema>;

/**
 * The default section order — this reproduces the current ("Kia") report flow
 * exactly. The one new section, `scopeCoverage`, ships disabled so an
 * unconfigured engagement's report is byte-for-byte the same as before.
 */
export const DEFAULT_REPORT_SECTIONS: ReportSectionEntry[] = [
  { key: 'executiveSummary', enabled: true },
  { key: 'assessmentFindings', enabled: true },
  { key: 'methodology', enabled: true },
  { key: 'threatModel', enabled: true },
  { key: 'assessmentExecution', enabled: true },
  { key: 'scopeCoverage', enabled: false },
  { key: 'detailedFindings', enabled: true },
  { key: 'supportingInformation', enabled: true },
  { key: 'appendix', enabled: true },
];

/**
 * Per-engagement report configuration. Every field has a default, so
 * `reportConfigSchema.parse(eng.reportConfig ?? {})` yields the canonical default
 * for an engagement that has never been configured.
 */
export const reportConfigSchema = z.object({
  sections: z.array(reportSectionEntrySchema).max(50).default(DEFAULT_REPORT_SECTIONS),
  customSections: z.array(reportCustomSectionSchema).max(30).default([]),
  /** Include every finding; otherwise only "Ready to report" findings. */
  includeAllFindings: z.boolean().default(false),
  /** Include the auto-generated evidence log in Assessment Execution. */
  includeEvidenceTimeline: z.boolean().default(false),
  /** How that evidence log is grouped. */
  evidenceGroup: evidenceGroupingSchema.default('chronological'),
  /**
   * How findings are organized in the Assessment Findings + Detailed Findings
   * sections. Defaults to `severity`, reproducing the prior flat, most-severe-
   * first layout, so an unconfigured engagement's report is unchanged.
   */
  findingGroup: findingGroupingSchema.default('severity'),
});
export type ReportConfig = z.infer<typeof reportConfigSchema>;

/**
 * The ordered section list for a canned report "type" (everything but `custom`,
 * which renders the engagement's saved configuration). `full` reproduces the
 * default report; `executive` and `findings` are focused subsets.
 */
export function reportPresetSections(
  preset: Exclude<ReportPreset, 'custom'>,
): ReportSectionEntry[] {
  switch (preset) {
    case 'full':
      return DEFAULT_REPORT_SECTIONS.map((s) => ({ ...s }));
    case 'executive':
      return [{ key: 'executiveSummary', enabled: true }];
    case 'findings':
      return [
        { key: 'assessmentFindings', enabled: true },
        { key: 'detailedFindings', enabled: true },
      ];
  }
}

// ---------------------------------------------------------------------------
// Goals: Target → Activity → Goal (engagement scope & objectives)
// ---------------------------------------------------------------------------

/** A goal / area of interest under an activity — the trackable unit. */
export const goalSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(500),
  status: goalStatusSchema,
  /** Carried over from a prior report as a retest item (e.g. a "W1-…" goal). */
  isRetest: z.boolean(),
  notes: z.string(),
  position: z.number().int().nonnegative(),
  numEvidence: z.number().int().nonnegative(),
  numFindings: z.number().int().nonnegative(),
});
export type Goal = z.infer<typeof goalSchema>;

/** A testing activity on a target, with its category and correlation tag. */
export const activitySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(255),
  category: z.string(),
  /** The engagement tag auto-created for this activity (timeline correlation). */
  tagId: z.number().int().positive().nullable(),
  position: z.number().int().nonnegative(),
  goals: z.array(goalSchema),
});
export type Activity = z.infer<typeof activitySchema>;

/** A system/device under scope, with its activities. */
export const targetSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(255),
  description: z.string(),
  position: z.number().int().nonnegative(),
  activities: z.array(activitySchema),
});
export type Target = z.infer<typeof targetSchema>;

/** Rolled-up goal progress for an engagement (or a subtree). */
export const engagementProgressSchema = z.object({
  total: z.number().int().nonnegative(),
  complete: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  notStarted: z.number().int().nonnegative(),
  notApplicable: z.number().int().nonnegative(),
  /** complete / (total − notApplicable), as a whole percent; 0 when nothing to do. */
  percent: z.number().int().min(0).max(100),
});
export type EngagementProgress = z.infer<typeof engagementProgressSchema>;

/** The full goals tree for an engagement, plus its rolled-up progress. */
export const goalsTreeSchema = z.object({
  targets: z.array(targetSchema),
  progress: engagementProgressSchema,
});
export type GoalsTree = z.infer<typeof goalsTreeSchema>;

/** A goal as referenced from an evidence/finding "linked goals" list. */
export const linkedGoalSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  status: goalStatusSchema,
  targetName: z.string(),
  activityName: z.string(),
});
export type LinkedGoal = z.infer<typeof linkedGoalSchema>;

// ---------------------------------------------------------------------------
// Entities (server → client shapes)
// ---------------------------------------------------------------------------

export const userSchema = z.object({
  slug: slugSchema,
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  admin: z.boolean(),
  disabled: z.boolean(),
  headless: z.boolean(),
  /**
   * Only populated on `/web/me`: true after a recovery-link sign-in, until the
   * user sets a new password (which then doesn't require the current one).
   */
  mustResetPassword: z.boolean().optional(),
});
export type User = z.infer<typeof userSchema>;

/**
 * A user as seen from the admin console: the base user plus whether they have
 * a TOTP secret enrolled (drives the admin "Reset TOTP" action).
 */
export const adminUserSchema = userSchema.extend({
  hasTotp: z.boolean(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const engagementSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(255),
  status: engagementStatusSchema,
  numUsers: z.number().int().nonnegative().optional(),
  numEvidence: z.number().int().nonnegative().optional(),
  numFindings: z.number().int().nonnegative().optional(),
  favorite: z.boolean().optional(),
  role: engagementRoleSchema.optional(),
  createdAt: isoDateSchema,
  /** When the engagement began (defaults to creation time; user-editable). */
  startedAt: isoDateSchema,
  /** Operator-entered target end date; null until set. */
  projectedEndAt: isoDateSchema.nullable(),
  /**
   * When the engagement actually wrapped up. The server stamps this to "now" on
   * any transition into `complete`/`archived` and clears it on a return to
   * `active`; it can also be overridden manually. Null while still active.
   */
  actualEndAt: isoDateSchema.nullable(),
  // Optional report metadata (surfaced on the exported findings-report PDF).
  // Present-or-null on every engagement; edited on the Settings page.
  clientName: z.string().nullable().optional(),
  assessmentType: z.string().nullable().optional(),
  testApproach: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  scope: z.string().nullable().optional(),
  executiveSummary: z.string().nullable().optional(),
  methodology: z.string().nullable().optional(),
  /** Narrative statement of engagement objectives (heads the Goals tab). */
  objectivesNarrative: z.string().nullable().optional(),
  // Structured report content. Present on the engagement-detail read shape; omitted
  // from lean list responses (hence optional). Each list defaults to empty server-side.
  scopeTargets: z.array(scopeTargetSchema).optional(),
  scopeExclusions: z.array(z.string()).optional(),
  strategicRecommendations: z.array(recommendationItemSchema).optional(),
  threatModelNarrative: z.string().nullable().optional(),
  threatModelDiagrams: z.array(threatDiagramSchema).optional(),
  executionNarrative: z.array(executionSubsectionSchema).optional(),
  providerContacts: z.array(contactSchema).optional(),
  clientContacts: z.array(contactSchema).optional(),
  softwareTested: z.array(softwareItemSchema).optional(),
  thirdPartySoftware: z.array(softwareItemSchema).optional(),
  // Per-engagement report watermark (drawn on every exported-PDF page but the cover).
  watermarkEnabled: z.boolean().optional(),
  watermarkText: z.string().nullable().optional(),
  watermarkColor: z.string().nullable().optional(),
  watermarkOpacity: watermarkOpacitySchema.optional(),
  watermarkLayer: watermarkLayerSchema.optional(),
  // Report composition config. Always present on responses (normalized to the
  // canonical default for an unconfigured engagement).
  reportConfig: reportConfigSchema.optional(),
  // Rolled-up goal progress; present on list + detail once goals exist.
  progress: engagementProgressSchema.optional(),
  /** Whether a proposal JSON has been imported (raw kept server-side for provenance). */
  hasProposalImport: z.boolean().optional(),
});
export type Engagement = z.infer<typeof engagementSchema>;

/**
 * An engagement as seen from the admin console: every engagement site-wide,
 * plus whether the requesting admin is themselves a member (non-members don't
 * see it on their main Engagements page).
 */
export const adminEngagementSchema = engagementSchema.extend({
  amMember: z.boolean(),
});
export type AdminEngagement = z.infer<typeof adminEngagementSchema>;

/** A user attached to an engagement, with their role on it. */
export const engagementMemberSchema = z.object({
  user: userSchema,
  role: engagementRoleSchema,
});
export type EngagementMember = z.infer<typeof engagementMemberSchema>;

/** Add (or re-role) a member on an engagement by their account email. */
export const addEngagementMemberInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: engagementRoleSchema,
});
export type AddEngagementMemberInput = z.infer<typeof addEngagementMemberInput>;

export const tagSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(64),
  colorName: z.string(),
  /** How many pieces of evidence carry this tag. Present on list responses;
   *  drives the "in use" warning when deleting a tag. */
  usageCount: z.number().int().nonnegative().optional(),
});
export type Tag = z.infer<typeof tagSchema>;

export const evidenceSchema = z.object({
  uuid: uuidSchema,
  engagementSlug: slugSchema,
  operator: userSchema.pick({ slug: true, firstName: true, lastName: true }),
  /** Short label for the evidence — the primary heading shown in lists, cards, and
   *  the report. May be empty on evidence created before titles existed (the UI then
   *  falls back to the description, then the content-type label). */
  title: z.string(),
  /** Longer prose about the evidence, shown in full on the detail view and as a
   *  snippet elsewhere. */
  description: z.string(),
  contentType: evidenceTypeSchema,
  /** Original uploaded filename, when known (used to name files in the report ZIP). */
  originalFilename: z.string().nullable().optional(),
  occurredAt: isoDateSchema,
  createdAt: isoDateSchema,
  tags: z.array(tagSchema),
  /** Present when the evidence has a stored blob (image/recording/har). */
  hasContent: z.boolean(),
  hasThumbnail: z.boolean(),
  /**
   * When this evidence is a comment on another piece of evidence, the parent's
   * uuid; otherwise null. Comments are themselves full evidence, linked to a
   * single parent (see `createEvidenceInput.parentEvidenceUuid`).
   */
  parentEvidenceUuid: uuidSchema.nullable(),
  /** How many comments (linked evidence) point at this piece of evidence. */
  commentCount: z.number().int().nonnegative(),
  /** Whether the requesting user starred this evidence (per-user, like engagement favorites). */
  starred: z.boolean().optional(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

/**
 * Evidence as it appears attached to a finding: the base evidence shape plus the
 * per-link bucket fields. `inPath` splits a finding's evidence into two buckets —
 * the ordered, captioned Attack Path (`true`) and plain Attached Evidence
 * (`false`); `caption` describes the step in the Attack Path.
 */
export const findingEvidenceSchema = evidenceSchema.extend({
  caption: z.string(),
  inPath: z.boolean(),
});
export type FindingEvidence = z.infer<typeof findingEvidenceSchema>;

export const findingCategorySchema = z.object({
  id: z.number().int().positive(),
  category: z.string().min(1).max(255),
});
export type FindingCategory = z.infer<typeof findingCategorySchema>;

export const findingSchema = z.object({
  uuid: uuidSchema,
  engagementSlug: slugSchema,
  title: z.string().min(1).max(255),
  description: z.string(),
  /** Whether this finding is a weakness (default) or a security strength. */
  kind: findingKindSchema,
  /** System/component the finding applies to (may be empty). */
  affectedTarget: z.string(),
  /** Business/technical impact if exploited — distinct from the description (weaknesses). */
  impact: z.string(),
  /** Estimated remediation effort (weaknesses). */
  fixEffort: fixEffortSchema,
  /** Mapped ISO/SAE 21434 reference ids (see the standards catalog). */
  iso21434Refs: z.array(z.string()),
  /** Mapped UN R155 reference ids (see the standards catalog). */
  unr155Refs: z.array(z.string()),
  /** Recommended remediation / fix guidance (may be empty). */
  remediation: z.string(),
  category: z.string().nullable(),
  /** Qualitative severity (CVSS v3.1 scale); null when not yet rated. */
  severity: severitySchema.nullable(),
  /** Full CVSS v3.1 base vector string, when rated via the calculator. */
  cvssVector: z.string().nullable(),
  /** CVSS v3.1 base score (0.0–10.0), derived from the vector. */
  cvssScore: z.number().min(0).max(10).nullable(),
  readyToReport: z.boolean(),
  /** Manual sort position within the engagement's findings (ascending). */
  position: z.number().int().nonnegative(),
  numEvidence: z.number().int().nonnegative(),
  createdAt: isoDateSchema,
});
export type Finding = z.infer<typeof findingSchema>;

/**
 * A finding plus its attached evidence, as returned by the finding-detail route.
 * Evidence is a flat list carrying each link's bucket (`inPath`) and `caption`;
 * the client splits it into Attack Path (inPath=true) and Attached Evidence
 * (inPath=false), each ordered by the link's stored position.
 */
export const findingDetailSchema = findingSchema.extend({
  evidence: z.array(findingEvidenceSchema),
});
export type FindingDetail = z.infer<typeof findingDetailSchema>;

export const apiKeySchema = z.object({
  accessKey: z.string(),
  /** Only returned once, at creation time. */
  secretKey: z.string().optional(),
  lastAuth: isoDateSchema.nullable(),
  createdAt: isoDateSchema,
});
export type ApiKey = z.infer<typeof apiKeySchema>;

export const savedQuerySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(255),
  query: z.string(),
  type: savedQueryTypeSchema,
});
export type SavedQuery = z.infer<typeof savedQuerySchema>;

// ---------------------------------------------------------------------------
// Request payloads (client → server)
// ---------------------------------------------------------------------------

export const createEngagementInput = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(255),
  /** Optional target end date, set at creation time. */
  projectedEndAt: isoDateSchema.nullable().optional(),
});
export type CreateEngagementInput = z.infer<typeof createEngagementInput>;

/**
 * Partial update of an engagement's details. Dates are nullable so the client
 * can clear them. Moving `status` into `complete`/`archived` makes the server
 * stamp `actualEndAt`; a return to `active` clears it — unless `actualEndAt` is
 * given explicitly in the same request, which always wins.
 */
export const updateEngagementInput = z.object({
  name: z.string().min(1).max(255).optional(),
  status: engagementStatusSchema.optional(),
  startedAt: isoDateSchema.optional(),
  projectedEndAt: isoDateSchema.nullable().optional(),
  actualEndAt: isoDateSchema.nullable().optional(),
  // Report metadata. Each is nullable so an empty field clears it.
  clientName: z.string().max(255).nullable().optional(),
  assessmentType: z.string().max(255).nullable().optional(),
  testApproach: z.string().max(255).nullable().optional(),
  location: z.string().max(255).nullable().optional(),
  scope: z.string().max(20_000).nullable().optional(),
  executiveSummary: z.string().max(20_000).nullable().optional(),
  methodology: z.string().max(20_000).nullable().optional(),
  objectivesNarrative: z.string().max(20_000).nullable().optional(),
  // Structured report content (JSON lists). Each is optional so a request can set
  // just one; sending an empty array clears that list. Sizes are capped to bound
  // the engagement row + PDF payload.
  scopeTargets: z.array(scopeTargetSchema).max(100).optional(),
  scopeExclusions: z.array(z.string().max(500)).max(100).optional(),
  strategicRecommendations: z.array(recommendationItemSchema).max(200).optional(),
  threatModelNarrative: z.string().max(20_000).nullable().optional(),
  threatModelDiagrams: z.array(threatDiagramSchema).max(12).optional(),
  executionNarrative: z.array(executionSubsectionSchema).max(100).optional(),
  providerContacts: z.array(contactSchema).max(50).optional(),
  clientContacts: z.array(contactSchema).max(50).optional(),
  softwareTested: z.array(softwareItemSchema).max(200).optional(),
  thirdPartySoftware: z.array(softwareItemSchema).max(200).optional(),
  // Report watermark. Text/color are nullable so an empty field restores the default.
  // Text is capped short so the diagonal word always fits the page (see WATERMARK_MAX_CHARS).
  watermarkEnabled: z.boolean().optional(),
  watermarkText: z.string().max(WATERMARK_MAX_CHARS).nullable().optional(),
  watermarkColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb hex color')
    .nullable()
    .optional(),
  watermarkOpacity: watermarkOpacitySchema.optional(),
  watermarkLayer: watermarkLayerSchema.optional(),
  // Report composition config (Reports section). Replaces the whole config.
  reportConfig: reportConfigSchema.optional(),
});
export type UpdateEngagementInput = z.infer<typeof updateEngagementInput>;

// ---------------------------------------------------------------------------
// Goals request payloads (client → server)
// ---------------------------------------------------------------------------

export const createTargetInput = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(10_000).default(''),
});
export type CreateTargetInput = z.infer<typeof createTargetInput>;

export const updateTargetInput = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(10_000).optional(),
});
export type UpdateTargetInput = z.infer<typeof updateTargetInput>;

export const createActivityInput = z.object({
  name: z.string().min(1).max(255),
  category: z.string().max(120).default(''),
});
export type CreateActivityInput = z.infer<typeof createActivityInput>;

export const updateActivityInput = z.object({
  name: z.string().min(1).max(255).optional(),
  category: z.string().max(120).optional(),
});
export type UpdateActivityInput = z.infer<typeof updateActivityInput>;

export const createGoalInput = z.object({
  title: z.string().min(1).max(500),
  isRetest: z.boolean().default(false),
  notes: z.string().max(10_000).default(''),
});
export type CreateGoalInput = z.infer<typeof createGoalInput>;

export const updateGoalInput = z.object({
  title: z.string().min(1).max(500).optional(),
  status: goalStatusSchema.optional(),
  isRetest: z.boolean().optional(),
  notes: z.string().max(10_000).optional(),
});
export type UpdateGoalInput = z.infer<typeof updateGoalInput>;

/** Link one or more pieces of evidence to a goal. */
export const linkGoalEvidenceInput = z.object({
  evidenceUuids: z.array(uuidSchema).min(1).max(500),
});
export type LinkGoalEvidenceInput = z.infer<typeof linkGoalEvidenceInput>;

/** Link one or more findings to a goal. */
export const linkGoalFindingInput = z.object({
  findingUuids: z.array(uuidSchema).min(1).max(500),
});
export type LinkGoalFindingInput = z.infer<typeof linkGoalFindingInput>;

/** Reorder request keyed by numeric ids (targets, activities, or goals). */
export const reorderIdsInput = z.object({
  orderedIds: z.array(z.number().int().positive()).min(1),
});
export type ReorderIdsInput = z.infer<typeof reorderIdsInput>;

export const createTagInput = z.object({
  name: z.string().min(1).max(64),
  colorName: z.string(),
});
export type CreateTagInput = z.infer<typeof createTagInput>;

/**
 * Metadata for a new piece of evidence. Sent as the JSON `notes` part of the
 * multipart upload; the binary blob (if any) is the `file` part. For codeblock/
 * event/none, `content` may be provided inline instead of a file.
 */
export const createEvidenceInput = z.object({
  /** Short label for the evidence (required). Shown as the heading everywhere. */
  title: z.string().min(1).max(255),
  description: z.string().default(''),
  contentType: evidenceTypeSchema,
  occurredAt: isoDateSchema.optional(),
  tagIds: z.array(z.number().int().positive()).default([]),
  /** Inline text content for codeblock/event/none types. */
  content: z.string().optional(),
  /** Language hint for codeblock evidence. */
  contentSubtype: z.string().optional(),
  /** Original filename of an uploaded file, when the client knows it (used to name
   *  files in the report's supporting-files ZIP). File uploads also capture it
   *  from the multipart part server-side. */
  originalFilename: z.string().max(255).optional(),
  /**
   * When set, this evidence becomes a comment on the referenced (top-level)
   * evidence in the same engagement — a way to link evidence together and track
   * follow-ups/updates. The parent must not itself be a comment (one level deep).
   */
  parentEvidenceUuid: uuidSchema.optional(),
});
export type CreateEvidenceInput = z.infer<typeof createEvidenceInput>;

/**
 * Partial update of a piece of evidence's editable metadata. Every field is
 * optional so the client can autosave one at a time; `title`, when present, must
 * be non-empty (it is required on the record).
 */
export const updateEvidenceInput = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  occurredAt: isoDateSchema.optional(),
  tagIds: z.array(z.number().int().positive()).optional(),
});
export type UpdateEvidenceInput = z.infer<typeof updateEvidenceInput>;

export const createFindingInput = z.object({
  title: z.string().min(1).max(255),
  description: z.string().default(''),
  category: z.string().nullable().default(null),
  /** Weakness (default) or strength. */
  kind: findingKindSchema.default('weakness'),
  affectedTarget: z.string().max(255).default(''),
  impact: z.string().max(20_000).default(''),
  fixEffort: fixEffortSchema.default('none'),
  iso21434Refs: z.array(z.string().max(120)).max(100).default([]),
  unr155Refs: z.array(z.string().max(120)).max(100).default([]),
});
export type CreateFindingInput = z.infer<typeof createFindingInput>;

/**
 * Partial update of a finding. `cvssScore` is never accepted from the client —
 * the server derives it from `cvssVector` so the number can't drift from the
 * vector. Setting `cvssVector` recomputes both score and severity server-side;
 * setting `severity` without a vector records a manual (simple-mode) rating.
 */
export const updateFindingInput = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  kind: findingKindSchema.optional(),
  affectedTarget: z.string().max(255).optional(),
  impact: z.string().max(20_000).optional(),
  fixEffort: fixEffortSchema.optional(),
  iso21434Refs: z.array(z.string().max(120)).max(100).optional(),
  unr155Refs: z.array(z.string().max(120)).max(100).optional(),
  remediation: z.string().max(20_000).optional(),
  category: z.string().nullable().optional(),
  severity: severitySchema.nullable().optional(),
  cvssVector: cvssVectorSchema.nullable().optional(),
  readyToReport: z.boolean().optional(),
});
export type UpdateFindingInput = z.infer<typeof updateFindingInput>;

/**
 * Reorder request. For findings it lists every finding in the engagement; for a
 * finding's evidence it lists one bucket's links in their new order (the server
 * assigns positions by array index within that bucket).
 */
export const reorderInput = z.object({
  orderedUuids: z.array(uuidSchema).min(1),
});
export type ReorderInput = z.infer<typeof reorderInput>;

/**
 * Attach one or more pieces of evidence to a finding. `inPath` picks the target
 * bucket: the ordered Attack Path (`true`) or plain Attached Evidence (`false`,
 * the default). New links append to the end of that bucket.
 */
export const attachEvidenceInput = z.object({
  evidenceUuids: z.array(uuidSchema).min(1),
  inPath: z.boolean().default(false),
});
export type AttachEvidenceInput = z.infer<typeof attachEvidenceInput>;

/**
 * Update a single evidence↔finding link. `caption` sets the Attack Path step
 * text; changing `inPath` moves the link to the other bucket (appended to its
 * end). Both are optional so the client can set either independently.
 */
export const updateFindingEvidenceInput = z.object({
  caption: z.string().max(2000).optional(),
  inPath: z.boolean().optional(),
});
export type UpdateFindingEvidenceInput = z.infer<typeof updateFindingEvidenceInput>;

// ---------------------------------------------------------------------------
// Client API responses
// ---------------------------------------------------------------------------

export const checkConnectionResult = z.object({
  ok: z.literal(true),
  user: userSchema.pick({ slug: true, firstName: true, lastName: true, email: true }),
  serverVersion: z.string(),
});
export type CheckConnectionResult = z.infer<typeof checkConnectionResult>;

/** Standard paginated envelope for list endpoints. */
export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  });
}

// ---------------------------------------------------------------------------
// Findings export / import envelope (report.json)
// ---------------------------------------------------------------------------

/** Bump when the export shape changes incompatibly; import validates it. */
export const FINDINGS_EXPORT_VERSION = 3;

/** One evidence item inside an export. `contentBase64` is present only when the
 *  export was requested with `includeEvidenceContent` (makes it portable across
 *  servers); otherwise evidence is referenced by uuid + metadata only. */
export const exportedEvidenceSchema = z.object({
  uuid: uuidSchema,
  /** Evidence title (report v3+); defaults to empty for exports made before it existed. */
  title: z.string().default(''),
  description: z.string(),
  contentType: evidenceTypeSchema,
  contentSubtype: z.string().nullable().optional(),
  originalFilename: z.string().nullable().optional(),
  occurredAt: isoDateSchema,
  contentBase64: z.string().optional(),
  /** Attack Path step caption for this link (empty for plain attached evidence). */
  caption: z.string().default(''),
  /** Which bucket the link belongs to: Attack Path (true) vs Attached Evidence (false). */
  inPath: z.boolean().default(false),
});
export type ExportedEvidence = z.infer<typeof exportedEvidenceSchema>;

/** Per-finding evidence cap on import, so a crafted file can't create unbounded rows/blobs. */
export const MAX_IMPORT_EVIDENCE_PER_FINDING = 1000;
/** Total findings cap on import. */
export const MAX_IMPORT_FINDINGS = 5000;

export const exportedFindingSchema = z.object({
  uuid: uuidSchema,
  title: z.string().min(1).max(255),
  description: z.string(),
  /** Remediation guidance; defaults to empty for exports made before it existed. */
  remediation: z.string().default(''),
  category: z.string().nullable(),
  // Report v2 fields. All default so v1 exports (pre-v2) import cleanly.
  kind: findingKindSchema.default('weakness'),
  affectedTarget: z.string().default(''),
  impact: z.string().default(''),
  fixEffort: fixEffortSchema.default('none'),
  iso21434Refs: z.array(z.string()).default([]),
  unr155Refs: z.array(z.string()).default([]),
  severity: severitySchema.nullable(),
  cvssVector: z.string().nullable(),
  cvssScore: z.number().min(0).max(10).nullable(),
  readyToReport: z.boolean(),
  position: z.number().int().nonnegative(),
  evidence: z.array(exportedEvidenceSchema).max(MAX_IMPORT_EVIDENCE_PER_FINDING),
});
export type ExportedFinding = z.infer<typeof exportedFindingSchema>;

export const findingsExportSchema = z.object({
  schemaVersion: z.number().int().positive(),
  exportedAt: isoDateSchema,
  engagement: z.object({ slug: slugSchema, name: z.string() }),
  includesEvidenceContent: z.boolean(),
  findings: z.array(exportedFindingSchema).max(MAX_IMPORT_FINDINGS),
});
export type FindingsExport = z.infer<typeof findingsExportSchema>;

// ---------------------------------------------------------------------------
// Report branding (site-wide settings for generated PDFs)
// ---------------------------------------------------------------------------

/** Site-wide report branding, as returned to the web app. */
export const reportSettingsSchema = z.object({
  organizationName: z.string(),
  accentColor: z.string(),
  /** Inline data: URI for the cover logo (small PNG/SVG), or null for a text wordmark. */
  logoDataUri: z.string().nullable(),
  /** Optional confidentiality/footer line; null falls back to a sensible default. */
  footerNote: z.string().nullable(),
});
export type ReportSettings = z.infer<typeof reportSettingsSchema>;

/** Partial update of report branding (site admins only). */
export const updateReportSettingsInput = z.object({
  organizationName: z.string().min(1).max(120).optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb hex color')
    .optional(),
  // A data: URI (image/png|jpeg|svg+xml or webp). Capped ~1.5 MB of base64 so the
  // logo embeds in every PDF without bloating it. null clears it (text wordmark).
  logoDataUri: z
    .string()
    .max(1_500_000)
    .regex(/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/, 'must be an image data URI')
    .nullable()
    .optional(),
  footerNote: z.string().max(200).nullable().optional(),
});
export type UpdateReportSettingsInput = z.infer<typeof updateReportSettingsInput>;

/** Outcome of importing a findings export into an engagement. */
export const findingsImportResult = z.object({
  findingsCreated: z.number().int().nonnegative(),
  findingsUpdated: z.number().int().nonnegative(),
  /** Findings skipped because their uuid already exists in another engagement. */
  findingsSkipped: z.number().int().nonnegative(),
  /** Evidence recreated from embedded base64 content. */
  evidenceCreated: z.number().int().nonnegative(),
  /** Evidence already present (by uuid) that was linked to the finding. */
  evidenceLinked: z.number().int().nonnegative(),
  /** Evidence skipped: no embedded content to recreate it, or a cross-engagement uuid. */
  evidenceSkipped: z.number().int().nonnegative(),
});
export type FindingsImportResult = z.infer<typeof findingsImportResult>;
