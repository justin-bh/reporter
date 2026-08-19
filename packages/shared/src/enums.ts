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

/** A user's role within a single engagement. */
export const ENGAGEMENT_ROLES = ['admin', 'write', 'read'] as const;
export const engagementRoleSchema = z.enum(ENGAGEMENT_ROLES);
export type EngagementRole = z.infer<typeof engagementRoleSchema>;

/** Ordered from most to least privileged; used for `requireEngagementRole` checks. */
export const ROLE_RANK: Record<EngagementRole, number> = { admin: 3, write: 2, read: 1 };

export const ENGAGEMENT_STATUSES = ['active', 'complete', 'archived'] as const;
export const engagementStatusSchema = z.enum(ENGAGEMENT_STATUSES);
export type EngagementStatus = z.infer<typeof engagementStatusSchema>;

/** Authentication schemes an identity can use. */
export const AUTH_SCHEMES = ['local', 'oidc', 'recovery'] as const;
export const authSchemeSchema = z.enum(AUTH_SCHEMES);
export type AuthScheme = z.infer<typeof authSchemeSchema>;

/** Saved queries target either the evidence timeline or the findings list. */
export const SAVED_QUERY_TYPES = ['evidence', 'findings'] as const;
export const savedQueryTypeSchema = z.enum(SAVED_QUERY_TYPES);
export type SavedQueryType = z.infer<typeof savedQueryTypeSchema>;

/**
 * How the report's "Assessment Execution" evidence timeline is organized:
 * `chronological` (a flat, time-ordered log), `tag` (grouped by evidence tag),
 * or `type` (grouped by evidence content type).
 */
export const EVIDENCE_GROUPINGS = ['chronological', 'tag', 'type'] as const;
export const evidenceGroupingSchema = z.enum(EVIDENCE_GROUPINGS);
export type EvidenceGrouping = z.infer<typeof evidenceGroupingSchema>;

/** Human labels for the report evidence groupings. */
export const EVIDENCE_GROUPING_LABELS: Record<EvidenceGrouping, string> = {
  chronological: 'Chronological',
  tag: 'By tag',
  type: 'By type',
};

/** Report watermark transparency — three fixed levels mapped to opacities by the renderer. */
export const WATERMARK_OPACITIES = ['light', 'medium', 'strong'] as const;
export const watermarkOpacitySchema = z.enum(WATERMARK_OPACITIES);
export type WatermarkOpacity = z.infer<typeof watermarkOpacitySchema>;
export const WATERMARK_OPACITY_LABELS: Record<WatermarkOpacity, string> = {
  light: 'Light',
  medium: 'Medium',
  strong: 'Strong',
};

/** Whether the watermark sits under (behind) or above (front of) the page content. */
export const WATERMARK_LAYERS = ['behind', 'front'] as const;
export const watermarkLayerSchema = z.enum(WATERMARK_LAYERS);
export type WatermarkLayer = z.infer<typeof watermarkLayerSchema>;
export const WATERMARK_LAYER_LABELS: Record<WatermarkLayer, string> = {
  behind: 'Under content',
  front: 'Above content',
};

/**
 * Qualitative finding severity, matching the CVSS v3.1 severity rating scale.
 * Stored as the canonical, sortable severity of a finding; when a full CVSS
 * vector is present it is derived from the base score (see `severityFromScore`).
 */
export const SEVERITIES = ['none', 'low', 'medium', 'high', 'critical'] as const;
export const severitySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof severitySchema>;

/** Human labels for severities (glossary-consistent, Title Case). */
export const SEVERITY_LABELS: Record<Severity, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

/** Ordered from most to least severe; used to sort findings by risk. */
export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

/**
 * Map a CVSS v3.1 base score (0.0–10.0) to its qualitative severity rating,
 * using the official v3.1 severity bands.
 */
export function severityFromScore(score: number): Severity {
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  if (score >= 0.1) return 'low';
  return 'none';
}
