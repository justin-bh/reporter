import { z } from 'zod';
import {
  evidenceTypeSchema,
  operationRoleSchema,
  operationStatusSchema,
  savedQueryTypeSchema,
} from './enums.js';

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

export const operationSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(255),
  status: operationStatusSchema,
  numUsers: z.number().int().nonnegative().optional(),
  numEvidence: z.number().int().nonnegative().optional(),
  favorite: z.boolean().optional(),
  role: operationRoleSchema.optional(),
  createdAt: isoDateSchema,
});
export type Operation = z.infer<typeof operationSchema>;

export const tagSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(64),
  colorName: z.string(),
});
export type Tag = z.infer<typeof tagSchema>;

export const evidenceSchema = z.object({
  uuid: uuidSchema,
  operationSlug: slugSchema,
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
  operationSlug: slugSchema,
  title: z.string().min(1).max(255),
  description: z.string(),
  category: z.string().nullable(),
  readyToReport: z.boolean(),
  ticketLink: z.string().url().nullable(),
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

export const createOperationInput = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(255),
});
export type CreateOperationInput = z.infer<typeof createOperationInput>;

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
