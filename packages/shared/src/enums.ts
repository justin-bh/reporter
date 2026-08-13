import { z } from 'zod';

/** The kinds of evidence reporter can store. Mirrors ASHIRT's content types. */
export const EVIDENCE_TYPES = [
  'image',
  'codeblock',
  'terminal-recording',
  'http-request-cycle',
  'event',
  'none',
] as const;
export const evidenceTypeSchema = z.enum(EVIDENCE_TYPES);
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;

/** Human labels for evidence types (glossary-consistent). */
export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
  image: 'Screenshot',
  codeblock: 'Code block',
  'terminal-recording': 'Terminal recording',
  'http-request-cycle': 'HTTP request',
  event: 'Event',
  none: 'Note',
};

/** A user's role within a single operation. */
export const OPERATION_ROLES = ['admin', 'write', 'read'] as const;
export const operationRoleSchema = z.enum(OPERATION_ROLES);
export type OperationRole = z.infer<typeof operationRoleSchema>;

/** Ordered from most to least privileged; used for `requireOperationRole` checks. */
export const ROLE_RANK: Record<OperationRole, number> = { admin: 3, write: 2, read: 1 };

export const OPERATION_STATUSES = ['active', 'complete', 'archived'] as const;
export const operationStatusSchema = z.enum(OPERATION_STATUSES);
export type OperationStatus = z.infer<typeof operationStatusSchema>;

/** Authentication schemes an identity can use. */
export const AUTH_SCHEMES = ['local', 'oidc', 'recovery'] as const;
export const authSchemeSchema = z.enum(AUTH_SCHEMES);
export type AuthScheme = z.infer<typeof authSchemeSchema>;

/** Saved queries target either the evidence timeline or the findings list. */
export const SAVED_QUERY_TYPES = ['evidence', 'findings'] as const;
export const savedQueryTypeSchema = z.enum(SAVED_QUERY_TYPES);
export type SavedQueryType = z.infer<typeof savedQueryTypeSchema>;
