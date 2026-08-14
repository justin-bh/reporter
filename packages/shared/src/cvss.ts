/**
 * CVSS v3.1 Base Score calculator.
 *
 * A dependency-free, exact implementation of the Base metric group from the
 * official CVSS v3.1 specification (https://www.first.org/cvss/v3.1/specification-document).
 * We store the vector string as the source of truth on a finding and recompute
 * the numeric score + qualitative severity from it server-side, so a tampered
 * or stale score can never disagree with the vector.
 *
 * Only the Base metrics are modelled (the eight metrics every vector must
 * carry); Temporal/Environmental groups are intentionally out of scope.
 */
import { z } from 'zod';
import { severityFromScore, type Severity } from './enums.js';

export type CvssMetricKey = 'AV' | 'AC' | 'PR' | 'UI' | 'S' | 'C' | 'I' | 'A';

export interface CvssMetricOption {
  /** Single-letter value code as it appears in the vector string. */
  value: string;
  /** Human label for the UI. */
  label: string;
}

export interface CvssMetricDef {
  key: CvssMetricKey;
  label: string;
  options: readonly CvssMetricOption[];
}

/** The eight Base metrics, in canonical vector order, with their allowed values. */
export const CVSS_BASE_METRICS: readonly CvssMetricDef[] = [
  {
    key: 'AV',
    label: 'Attack Vector',
    options: [
      { value: 'N', label: 'Network' },
      { value: 'A', label: 'Adjacent' },
      { value: 'L', label: 'Local' },
      { value: 'P', label: 'Physical' },
    ],
  },
  {
    key: 'AC',
    label: 'Attack Complexity',
    options: [
      { value: 'L', label: 'Low' },
      { value: 'H', label: 'High' },
    ],
  },
  {
    key: 'PR',
    label: 'Privileges Required',
    options: [
      { value: 'N', label: 'None' },
      { value: 'L', label: 'Low' },
      { value: 'H', label: 'High' },
    ],
  },
  {
    key: 'UI',
    label: 'User Interaction',
    options: [
      { value: 'N', label: 'None' },
      { value: 'R', label: 'Required' },
    ],
  },
  {
    key: 'S',
    label: 'Scope',
    options: [
      { value: 'U', label: 'Unchanged' },
      { value: 'C', label: 'Changed' },
    ],
  },
  {
    key: 'C',
    label: 'Confidentiality',
    options: [
      { value: 'H', label: 'High' },
      { value: 'L', label: 'Low' },
      { value: 'N', label: 'None' },
    ],
  },
  {
    key: 'I',
    label: 'Integrity',
    options: [
      { value: 'H', label: 'High' },
      { value: 'L', label: 'Low' },
      { value: 'N', label: 'None' },
    ],
  },
  {
    key: 'A',
    label: 'Availability',
    options: [
      { value: 'H', label: 'High' },
      { value: 'L', label: 'Low' },
      { value: 'N', label: 'None' },
    ],
  },
] as const;

/** A complete set of Base metric selections, keyed by metric code. */
export type CvssBaseMetrics = Record<CvssMetricKey, string>;

/** Sensible default vector: the most severe combination (CVSS 10.0). */
export const CVSS_DEFAULT_METRICS: CvssBaseMetrics = {
  AV: 'N',
  AC: 'L',
  PR: 'N',
  UI: 'N',
  S: 'U',
  C: 'H',
  I: 'H',
  A: 'H',
};

// --- Metric weights (from the v3.1 spec) --------------------------------------

const AV_W: Record<string, number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };
const AC_W: Record<string, number> = { L: 0.77, H: 0.44 };
// Privileges Required weight depends on Scope.
const PR_W_UNCHANGED: Record<string, number> = { N: 0.85, L: 0.62, H: 0.27 };
const PR_W_CHANGED: Record<string, number> = { N: 0.85, L: 0.68, H: 0.5 };
const UI_W: Record<string, number> = { N: 0.85, R: 0.62 };
const CIA_W: Record<string, number> = { H: 0.56, L: 0.22, N: 0 };

const VALID_VALUES = Object.fromEntries(
  CVSS_BASE_METRICS.map((m) => [m.key, m.options.map((o) => o.value)]),
) as unknown as Record<CvssMetricKey, readonly string[]>;

const CVSS_KEYS: readonly CvssMetricKey[] = CVSS_BASE_METRICS.map((m) => m.key);

/** CVSS v3.1 Roundup: round up to one decimal place, floating-point-safe. */
function roundUp1(input: number): number {
  const intInput = Math.round(input * 100000);
  if (intInput % 10000 === 0) return intInput / 100000;
  return (Math.floor(intInput / 10000) + 1) / 10;
}

/** True if `m` provides a valid value for every Base metric. */
export function isCompleteBaseMetrics(m: Partial<CvssBaseMetrics>): m is CvssBaseMetrics {
  return CVSS_KEYS.every((k) => {
    const v = m[k];
    return typeof v === 'string' && VALID_VALUES[k].includes(v);
  });
}

/**
 * Compute the CVSS v3.1 Base Score (0.0–10.0) from a complete set of Base
 * metrics. Throws if any metric is missing or invalid.
 */
export function computeBaseScore(m: CvssBaseMetrics): number {
  if (!isCompleteBaseMetrics(m)) {
    throw new Error('Incomplete or invalid CVSS base metrics');
  }
  const scopeChanged = m.S === 'C';

  const iss = 1 - (1 - CIA_W[m.C]!) * (1 - CIA_W[m.I]!) * (1 - CIA_W[m.A]!);
  const impact = scopeChanged ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15) : 6.42 * iss;

  const prW = (scopeChanged ? PR_W_CHANGED : PR_W_UNCHANGED)[m.PR]!;
  const exploitability = 8.22 * AV_W[m.AV]! * AC_W[m.AC]! * prW * UI_W[m.UI]!;

  if (impact <= 0) return 0;
  const raw = scopeChanged
    ? Math.min(1.08 * (impact + exploitability), 10)
    : Math.min(impact + exploitability, 10);
  return roundUp1(raw);
}

/** Build the canonical `CVSS:3.1/AV:.../A:...` vector string from metrics. */
export function buildVector(m: CvssBaseMetrics): string {
  const body = CVSS_KEYS.map((k) => `${k}:${m[k]}`).join('/');
  return `CVSS:3.1/${body}`;
}

/**
 * Parse a CVSS v3.0/3.1 vector string into its Base metrics. Tolerates metric
 * order and ignores Temporal/Environmental metrics, but requires all eight Base
 * metrics to be present and valid. Returns null on any malformed input.
 */
export function parseVector(vector: string): CvssBaseMetrics | null {
  const trimmed = vector.trim();
  const parts = trimmed.split('/');
  const prefix = parts.shift();
  if (prefix !== 'CVSS:3.1' && prefix !== 'CVSS:3.0') return null;

  const found: Partial<CvssBaseMetrics> = {};
  for (const part of parts) {
    const [key, value] = part.split(':');
    if (!key || value === undefined) return null;
    if ((CVSS_KEYS as string[]).includes(key)) {
      const k = key as CvssMetricKey;
      if (!VALID_VALUES[k].includes(value)) return null;
      found[k] = value;
    }
    // Non-base metrics (E, RL, RC, CR, ...) are accepted but ignored.
  }
  return isCompleteBaseMetrics(found) ? found : null;
}

/** Compute score + severity + normalized vector for a vector string, or null. */
export function scoreVector(
  vector: string,
): { vector: string; score: number; severity: Severity } | null {
  const metrics = parseVector(vector);
  if (!metrics) return null;
  const score = computeBaseScore(metrics);
  return { vector: buildVector(metrics), score, severity: severityFromScore(score) };
}

/** A zod schema that validates a parseable CVSS v3.x Base vector string. */
export const cvssVectorSchema = z
  .string()
  .refine((v) => parseVector(v) !== null, { message: 'Invalid CVSS v3.1 vector string' });
