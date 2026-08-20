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

/** Estimated effort to remediate a finding, shown per-weakness in the report. */
export const FIX_EFFORTS = ['none', 'low', 'medium', 'high'] as const;
export const fixEffortSchema = z.enum(FIX_EFFORTS);
export type FixEffort = z.infer<typeof fixEffortSchema>;
export const FIX_EFFORT_LABELS: Record<FixEffort, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/**
 * Whether a finding records a security *weakness* (the default) or a *strength*.
 * Weaknesses carry severity/CVSS and appear in the report's weaknesses tables and
 * detailed cards; strengths are listed in a separate strengths summary table.
 */
export const FINDING_KINDS = ['weakness', 'strength'] as const;
export const findingKindSchema = z.enum(FINDING_KINDS);
export type FindingKind = z.infer<typeof findingKindSchema>;
export const FINDING_KIND_LABELS: Record<FindingKind, string> = {
  weakness: 'Weakness',
  strength: 'Strength',
};

/**
 * Lifecycle state of a single engagement goal (an area of interest under a
 * testing activity). Progress rolls up from these across the engagement.
 * `not_applicable` goals are excluded from the completion denominator.
 */
export const GOAL_STATUSES = ['not_started', 'in_progress', 'complete', 'not_applicable'] as const;
export const goalStatusSchema = z.enum(GOAL_STATUSES);
export type GoalStatus = z.infer<typeof goalStatusSchema>;
export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  complete: 'Complete',
  not_applicable: 'N/A',
};
/** Display order for the goal-status control (workflow order, not alphabetical). */
export const GOAL_STATUS_ORDER: Record<GoalStatus, number> = {
  not_started: 0,
  in_progress: 1,
  complete: 2,
  not_applicable: 3,
};

/**
 * The content sections of the exported report, in their canonical order. The
 * cover, engagement-details, and table-of-contents pages are structural and are
 * always emitted first; these are the sections a report configuration can
 * reorder and toggle. `scopeCoverage` (Scope & Objectives Coverage, driven by the
 * goals tree) is the one new section — off by default so the default report is
 * unchanged.
 */
export const REPORT_SECTIONS = [
  'executiveSummary',
  'assessmentFindings',
  'methodology',
  'threatModel',
  'assessmentExecution',
  'scopeCoverage',
  'detailedFindings',
  'supportingInformation',
  'appendix',
] as const;
export const reportSectionSchema = z.enum(REPORT_SECTIONS);
export type ReportSection = z.infer<typeof reportSectionSchema>;
export const REPORT_SECTION_LABELS: Record<ReportSection, string> = {
  executiveSummary: 'Executive Summary',
  assessmentFindings: 'Assessment Findings',
  methodology: 'Methodology & Approach',
  threatModel: 'Threat Model',
  assessmentExecution: 'Assessment Execution',
  scopeCoverage: 'Scope & Objectives Coverage',
  detailedFindings: 'Detailed Findings',
  supportingInformation: 'Supporting Information',
  appendix: 'Appendix: Severity & CVSS Reference',
};
/** Short hint shown under each toggle in the Reports configurator. */
export const REPORT_SECTION_HINTS: Record<ReportSection, string> = {
  executiveSummary: 'Summary prose, scope, severity distribution and key stats.',
  assessmentFindings: 'Strengths/weaknesses summary tables, recommendations, standards traceability.',
  methodology: 'The methodology narrative (or a sensible default).',
  threatModel: 'Threat-model narrative and diagrams (only renders when present).',
  assessmentExecution: 'Hand-authored execution narrative and optional evidence log.',
  scopeCoverage: 'Per-target coverage of activities and goals, with status and linked artifacts.',
  detailedFindings: 'Full per-weakness detail cards (attack path, evidence, remediation).',
  supportingInformation: 'Software tested, third-party software, and files attached.',
  appendix: 'Severity & CVSS reference table.',
};

/**
 * A named report "type" the Reports section offers as a one-click download.
 * `custom` renders the engagement's saved section configuration; the others are
 * canned section sets. The chosen preset also names the exported file
 * (`<slug>-<fileLabel>-<timestamp>.<ext>`) so different report types — and
 * repeated exports on the same day — never collide.
 */
export const REPORT_PRESETS = ['full', 'executive', 'findings', 'custom'] as const;
export const reportPresetSchema = z.enum(REPORT_PRESETS);
export type ReportPreset = z.infer<typeof reportPresetSchema>;
export const REPORT_PRESET_LABELS: Record<ReportPreset, string> = {
  full: 'Full report',
  executive: 'Executive summary',
  findings: 'Findings only',
  custom: 'Custom (configured sections)',
};
export const REPORT_PRESET_HINTS: Record<ReportPreset, string> = {
  full: 'Every default section, in the standard order.',
  executive: 'Cover, engagement details, and the executive summary only.',
  findings: 'The findings summary tables plus the full detailed findings.',
  custom: 'The sections you’ve enabled and reordered below.',
};
/** Filesystem-safe filename fragment for each report type. */
export const REPORT_PRESET_FILE_LABELS: Record<ReportPreset, string> = {
  full: 'full-report',
  executive: 'executive-summary',
  findings: 'findings',
  custom: 'custom-report',
};
