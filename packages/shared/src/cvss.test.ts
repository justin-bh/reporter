import { describe, it, expect } from 'vitest';
import {
  computeBaseScore,
  buildVector,
  parseVector,
  scoreVector,
  cvssVectorSchema,
  CVSS_DEFAULT_METRICS,
  type CvssBaseMetrics,
} from './cvss.js';
import { severityFromScore } from './enums.js';

/** Known-answer vectors from the CVSS v3.1 spec / calculator. */
const CASES: { vector: string; score: number; severity: string }[] = [
  // Fully critical, scope unchanged.
  { vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', score: 9.8, severity: 'critical' },
  // Fully critical, scope changed → capped at 10.0.
  { vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H', score: 10.0, severity: 'critical' },
  // No impact → 0.0 / None.
  { vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N', score: 0.0, severity: 'none' },
  // CVE-2021-44228 (Log4Shell) official base vector → 10.0.
  { vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H', score: 10.0, severity: 'critical' },
  // Heartbleed-style: network, low complexity, confidentiality only → 7.5 High.
  { vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N', score: 7.5, severity: 'high' },
  // Local, high privileges, low impacts → Low.
  { vector: 'CVSS:3.1/AV:L/AC:L/PR:H/UI:N/S:U/C:L/I:N/A:N', score: 2.3, severity: 'low' },
  // Adjacent, user interaction required, medium-ish → Medium.
  { vector: 'CVSS:3.1/AV:A/AC:L/PR:N/UI:R/S:U/C:L/I:L/A:N', score: 4.6, severity: 'medium' },
];

describe('computeBaseScore', () => {
  for (const c of CASES) {
    it(`scores ${c.vector} as ${c.score} (${c.severity})`, () => {
      const metrics = parseVector(c.vector);
      expect(metrics).not.toBeNull();
      const score = computeBaseScore(metrics as CvssBaseMetrics);
      expect(score).toBeCloseTo(c.score, 5);
      expect(severityFromScore(score)).toBe(c.severity);
    });
  }

  it('throws on incomplete metrics', () => {
    expect(() => computeBaseScore({ AV: 'N' } as CvssBaseMetrics)).toThrow();
  });
});

describe('parseVector / buildVector', () => {
  it('round-trips the default metrics', () => {
    const v = buildVector(CVSS_DEFAULT_METRICS);
    expect(v).toBe('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H');
    expect(parseVector(v)).toEqual(CVSS_DEFAULT_METRICS);
  });

  it('tolerates metric reordering and ignores temporal metrics', () => {
    const m = parseVector('CVSS:3.1/S:U/AV:N/AC:L/PR:N/UI:N/C:H/I:H/A:H/E:F/RL:O');
    expect(m).not.toBeNull();
    expect(m?.AV).toBe('N');
    expect(m?.S).toBe('U');
  });

  it('accepts CVSS:3.0 prefixes', () => {
    expect(parseVector('CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).not.toBeNull();
  });

  it('rejects malformed, wrong-version, or incomplete vectors', () => {
    expect(parseVector('CVSS:2.0/AV:N')).toBeNull();
    expect(parseVector('AV:N/AC:L')).toBeNull();
    expect(parseVector('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H')).toBeNull(); // missing A
    expect(parseVector('CVSS:3.1/AV:X/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toBeNull(); // bad value
  });
});

describe('scoreVector + cvssVectorSchema', () => {
  it('scoreVector returns normalized vector, score, and severity', () => {
    const r = scoreVector('CVSS:3.1/S:U/AV:N/AC:L/PR:N/UI:N/C:H/I:H/A:H');
    expect(r).toEqual({
      vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
      score: 9.8,
      severity: 'critical',
    });
  });

  it('zod schema accepts valid and rejects invalid vectors', () => {
    expect(cvssVectorSchema.safeParse('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H').success).toBe(
      true,
    );
    expect(cvssVectorSchema.safeParse('nonsense').success).toBe(false);
  });
});
