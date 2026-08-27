import { describe, it, expect } from 'vitest';
import {
  executionSubsectionSchema,
  recommendationItemSchema,
  reportConfigSchema,
  reportSectionEntrySchema,
  updateEngagementInput,
} from './schemas.js';
import { WATERMARK_MAX_CHARS } from './enums.js';

describe('recommendationItemSchema', () => {
  it('defaults findingUuids to [] for a legacy recommendation (no links)', () => {
    const parsed = recommendationItemSchema.parse({ title: 'Patch TLS' });
    expect(parsed.findingUuids).toEqual([]);
    expect(parsed.description).toBe('');
  });

  it('keeps the linked finding uuids when provided', () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    const parsed = recommendationItemSchema.parse({ title: 'Patch TLS', findingUuids: [uuid] });
    expect(parsed.findingUuids).toEqual([uuid]);
  });

  it('rejects a non-uuid finding link', () => {
    expect(
      recommendationItemSchema.safeParse({ title: 'Patch TLS', findingUuids: ['nope'] }).success,
    ).toBe(false);
  });
});

describe('reportConfigSchema', () => {
  it('defaults readinessNa to [] for an unconfigured engagement', () => {
    expect(reportConfigSchema.parse({}).readinessNa).toEqual([]);
  });

  it('round-trips readiness N/A overrides', () => {
    expect(reportConfigSchema.parse({ readinessNa: ['watermark', 'threatModel'] }).readinessNa).toEqual([
      'watermark',
      'threatModel',
    ]);
  });
});

describe('executionSubsectionSchema', () => {
  it('defaults a legacy subsection (no kind) to narrative', () => {
    const parsed = executionSubsectionSchema.parse({ title: 'CAN bus analysis' });
    expect(parsed.kind).toBe('narrative');
    expect(parsed.body).toBe('');
    expect(parsed.evidence).toEqual([]);
    expect(parsed.timeline).toBeUndefined();
  });

  it('parses a timeline subsection and fills timeline-config defaults', () => {
    const parsed = executionSubsectionSchema.parse({
      kind: 'timeline',
      title: 'Activity timeline',
      timeline: { tags: ['can'], starredOnly: true },
    });
    expect(parsed.kind).toBe('timeline');
    expect(parsed.timeline).toEqual({
      tags: ['can'],
      types: [],
      group: 'chronological',
      includeComments: false,
      starredOnly: true,
    });
  });

  it('still requires a title', () => {
    expect(executionSubsectionSchema.safeParse({ kind: 'timeline' }).success).toBe(false);
  });
});

describe('reportSectionEntrySchema', () => {
  it('accepts per-section sub-item option overrides', () => {
    const parsed = reportSectionEntrySchema.parse({
      key: 'detailedFindings',
      enabled: true,
      options: { attackPath: false, remediation: true },
    });
    expect(parsed.options).toEqual({ attackPath: false, remediation: true });
  });

  it('leaves options undefined when omitted', () => {
    const parsed = reportSectionEntrySchema.parse({ key: 'executiveSummary' });
    expect(parsed.options).toBeUndefined();
    expect(parsed.enabled).toBe(true);
  });
});

describe('watermarkText cap', () => {
  it('rejects text longer than WATERMARK_MAX_CHARS', () => {
    const tooLong = 'X'.repeat(WATERMARK_MAX_CHARS + 1);
    expect(updateEngagementInput.safeParse({ watermarkText: tooLong }).success).toBe(false);
    const ok = 'X'.repeat(WATERMARK_MAX_CHARS);
    expect(updateEngagementInput.safeParse({ watermarkText: ok }).success).toBe(true);
  });
});
