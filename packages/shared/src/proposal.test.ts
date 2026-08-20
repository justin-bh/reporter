import { describe, it, expect } from 'vitest';
import { isRetestTitle, proposalToImportDraft, proposalSuggestedName } from './proposal.js';

describe('isRetestTitle', () => {
  it('flags "W<n>-" carried-over items as retests, not ordinary goals', () => {
    expect(isRetestTitle('W1-TLS Accepting Weak & Outdated Ciphers')).toBe(true);
    expect(isRetestTitle('W12 Something')).toBe(true);
    expect(isRetestTitle('  W3-indented')).toBe(true);
    expect(isRetestTitle('Cryptographic Failures')).toBe(false);
    expect(isRetestTitle('Web-based auth')).toBe(false); // W not followed by a digit
  });
});

describe('proposalToImportDraft', () => {
  it('maps devices → targets, interfaces → activities, subItems → goals (with retest flags)', () => {
    const draft = proposalToImportDraft({
      companyName: 'Acme',
      devices: [
        {
          name: 'Fleet API',
          function: 'Data access',
          interfaces: [
            {
              name: 'REST API',
              category: 'Software / Application',
              subItems: ['Cryptographic Failures', 'W1-TLS Weak Ciphers'],
            },
          ],
        },
        // Empty-named device and empty-named interface are dropped.
        { name: '', interfaces: [] },
      ],
    });

    expect(draft.targets).toHaveLength(1);
    const target = draft.targets[0]!;
    expect(target).toMatchObject({ name: 'Fleet API', description: 'Data access' });
    expect(target.activities).toHaveLength(1);
    const activity = target.activities[0]!;
    expect(activity).toMatchObject({ name: 'REST API', category: 'Software / Application' });
    expect(activity.goals).toEqual([
      { title: 'Cryptographic Failures', isRetest: false },
      { title: 'W1-TLS Weak Ciphers', isRetest: true },
    ]);
  });

  it('imports only scope exclusions the author selected (checked !== false)', () => {
    const draft = proposalToImportDraft({
      scopeExclusions: [
        { text: 'Denial of Service (DoS)', checked: false },
        { text: 'Cracking Encryption Keys / Certificates', checked: true },
        { text: 'Destructive Testing', checked: false },
        { text: 'Legacy without flag' }, // absent flag → kept
      ],
    });
    expect(draft.metadata.scopeExclusions).toEqual([
      'Cracking Encryption Keys / Certificates',
      'Legacy without flag',
    ]);
  });

  it('never throws on odd/partial input and always returns a valid draft', () => {
    expect(proposalToImportDraft(null)).toEqual({ metadata: {}, targets: [] });
    expect(proposalToImportDraft({ devices: 'not-an-array' })).toEqual({
      metadata: {},
      targets: [],
    });
  });
});

describe('proposalSuggestedName', () => {
  it('joins company and test type', () => {
    expect(
      proposalSuggestedName({ companyName: 'May Mobility, Inc.', testType: 'Penetration Assessment' }),
    ).toBe('May Mobility, Inc. — Penetration Assessment');
    expect(proposalSuggestedName({ companyName: 'Solo' })).toBe('Solo');
    expect(proposalSuggestedName({})).toBe('');
  });
});
