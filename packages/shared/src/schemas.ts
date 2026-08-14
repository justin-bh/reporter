import { z } from 'zod';
import {
  evidenceTypeSchema,
  engagementRoleSchema,
  engagementStatusSchema,
  savedQueryTypeSchema,
  severitySchema,
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
});
export type User = z.infer<typeof userSchema>;

export const engagementSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(255),
  status: engagementStatusSchema,
  numUsers: z.number().int().nonnegative().optional(),
  numEvidence: z.number().int().nonnegative().optional(),
  favorite: z.boolean().optional(),
  role: engagementRoleSchema.optional(),
  createdAt: isoDateSchema,
});
export type Engagement = z.infer<typeof engagementSchema>;

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
});
export type Tag = z.infer<typeof tagSchema>;

export const evidenceSchema = z.object({
  uuid: uuidSchema,
  engagementSlug: slugSchema,
  operator: userSchema.pick({ slug: true, firstName: true, lastName: true }),
  description: z.string(),
  contentType: evidenceTypeSchema,
  occurredAt: isoDateSchema,
  createdAt: isoDateSchema,
  tags: z.array(tagSchema),
  /** Present when the evidence has a stored blob (image/recording/har). */
  hasContent: z.boolean(),
  hasThumbnail: z.boolean(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

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
  category: z.string().nullable(),
  /** Qualitative severity (CVSS v3.1 scale); null when not yet rated. */
  severity: severitySchema.nullable(),
  /** Full CVSS v3.1 base vector string, when rated via the calculator. */
  cvssVector: z.string().nullable(),
  /** CVSS v3.1 base score (0.0–10.0), derived from the vector. */
  cvssScore: z.number().min(0).max(10).nullable(),
  readyToReport: z.boolean(),
  ticketLink: z.string().url().nullable(),
  /** Manual sort position within the engagement's findings (ascending). */
  position: z.number().int().nonnegative(),
  numEvidence: z.number().int().nonnegative(),
  createdAt: isoDateSchema,
});
export type Finding = z.infer<typeof findingSchema>;

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
});
export type CreateEngagementInput = z.infer<typeof createEngagementInput>;

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
  description: z.string().default(''),
  contentType: evidenceTypeSchema,
  occurredAt: isoDateSchema.optional(),
  tagIds: z.array(z.number().int().positive()).default([]),
  /** Inline text content for codeblock/event/none types. */
  content: z.string().optional(),
  /** Language hint for codeblock evidence. */
  contentSubtype: z.string().optional(),
});
export type CreateEvidenceInput = z.infer<typeof createEvidenceInput>;

export const createFindingInput = z.object({
  title: z.string().min(1).max(255),
  description: z.string().default(''),
  category: z.string().nullable().default(null),
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
  category: z.string().nullable().optional(),
  severity: severitySchema.nullable().optional(),
  cvssVector: cvssVectorSchema.nullable().optional(),
  readyToReport: z.boolean().optional(),
  ticketLink: z.string().url().nullable().optional(),
});
export type UpdateFindingInput = z.infer<typeof updateFindingInput>;

/** Reorder request: the full ordered list of finding (or evidence) UUIDs. */
export const reorderInput = z.object({
  orderedUuids: z.array(uuidSchema).min(1),
});
export type ReorderInput = z.infer<typeof reorderInput>;

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
export const FINDINGS_EXPORT_VERSION = 1;

/** One evidence item inside an export. `contentBase64` is present only when the
 *  export was requested with `includeEvidenceContent` (makes it portable across
 *  servers); otherwise evidence is referenced by uuid + metadata only. */
export const exportedEvidenceSchema = z.object({
  uuid: uuidSchema,
  description: z.string(),
  contentType: evidenceTypeSchema,
  contentSubtype: z.string().nullable().optional(),
  occurredAt: isoDateSchema,
  contentBase64: z.string().optional(),
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
  category: z.string().nullable(),
  severity: severitySchema.nullable(),
  cvssVector: z.string().nullable(),
  cvssScore: z.number().min(0).max(10).nullable(),
  readyToReport: z.boolean(),
  ticketLink: z.string().url().nullable(),
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
