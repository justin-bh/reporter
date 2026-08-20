import { describe, it, expect } from 'vitest';
import {
  executionSubsectionSchema,
  reportSectionEntrySchema,
  updateEngagementInput,
} from './schemas.js';
import { WATERMARK_MAX_CHARS } from './enums.js';

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
