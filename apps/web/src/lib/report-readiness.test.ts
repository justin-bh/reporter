import { describe, expect, it } from 'vitest';
import { computeReadiness, type ReadinessInput } from './report-readiness.js';

/** A fully-complete input; individual tests knock out one field at a time. */
const complete: ReadinessInput = {
  clientName: 'Acme',
  assessmentType: 'External Penetration Assessment',
  location: 'AWS us-east-1',
  scope: 'The public web estate.',
  executiveSummary: 'We assessed…',
  methodology: 'Recon, testing, verification.',
  watermarkEnabled: true,
  scopeTargets: [{ name: 'Web app' }],
  recommendations: [{ title: 'Patch TLS', findingUuids: ['f-1'] }],
  threatModelNarrative: 'Adversary model…',
  threatModelDiagrams: [],
  executionNarrative: [{ title: 'CAN bus analysis' }],
  providerContacts: [{ name: 'Alice' }],
  clientContacts: [{ name: 'Bob' }],
  thirdPartySoftware: [{ name: 'Burp Suite' }],
  readyFindingCount: 2,
};

const keyOf = (r: ReturnType<typeof computeReadiness>, key: string) =>
  r.items.find((i) => i.key === key)!;

describe('computeReadiness', () => {
  it('is ready when every item is complete', () => {
    const r = computeReadiness(complete, []);
    expect(r.ready).toBe(true);
    expect(r.satisfiedCount).toBe(r.total);
    expect(r.percent).toBe(100);
    expect(r.total).toBe(15);
  });

  it('flags a missing scalar field and is not ready', () => {
    const r = computeReadiness({ ...complete, clientName: '  ' }, []);
    expect(r.ready).toBe(false);
    expect(keyOf(r, 'clientName').complete).toBe(false);
    expect(r.satisfiedCount).toBe(r.total - 1);
  });

  it('requires each recommendation to link at least one finding', () => {
    const unlinked = computeReadiness(
      { ...complete, recommendations: [{ title: 'Patch TLS', findingUuids: [] }] },
      [],
    );
    expect(keyOf(unlinked, 'recommendations').complete).toBe(false);

    const empty = computeReadiness({ ...complete, recommendations: [] }, []);
    expect(keyOf(empty, 'recommendations').complete).toBe(false);

    const linked = computeReadiness(
      { ...complete, recommendations: [{ title: 'Patch TLS', findingUuids: ['f-9'] }] },
      [],
    );
    expect(keyOf(linked, 'recommendations').complete).toBe(true);
  });

  it('treats the watermark as complete only when enabled', () => {
    const off = computeReadiness({ ...complete, watermarkEnabled: false }, []);
    expect(keyOf(off, 'watermark').complete).toBe(false);
  });

  it('accepts a threat model via narrative or a diagram', () => {
    const viaDiagram = computeReadiness(
      {
        ...complete,
        threatModelNarrative: '',
        threatModelDiagrams: [{ imageDataUri: 'data:image/png;base64,AAAA' }],
      },
      [],
    );
    expect(keyOf(viaDiagram, 'threatModel').complete).toBe(true);

    const neither = computeReadiness(
      { ...complete, threatModelNarrative: '', threatModelDiagrams: [] },
      [],
    );
    expect(keyOf(neither, 'threatModel').complete).toBe(false);
  });

  it('requires at least one ready-to-report finding', () => {
    const r = computeReadiness({ ...complete, readyFindingCount: 0 }, []);
    expect(keyOf(r, 'readyFinding').complete).toBe(false);
  });

  it('counts a Not-applicable item as satisfied but not complete', () => {
    const r = computeReadiness({ ...complete, watermarkEnabled: false }, ['watermark']);
    const wm = keyOf(r, 'watermark');
    expect(wm.complete).toBe(false);
    expect(wm.na).toBe(true);
    expect(wm.satisfied).toBe(true);
    expect(r.ready).toBe(true);
  });
});
