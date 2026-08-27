import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { proposalToImportDraft } from '@reporter/shared';
import { WEB_HEADERS, buildTestApp, loginCookie, seedUsers, truncateAll } from './helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await truncateAll(app);
});

async function setup() {
  const users = await seedUsers(app);
  await app.db.engagement.create({
    data: {
      slug: 'op1',
      name: 'Op One',
      roles: {
        create: [
          { userId: users.writer.id, role: 'write' },
          { userId: users.reader.id, role: 'read' },
        ],
      },
    },
  });
  const cookie = await loginCookie(app, 'writer@test.local', 'password123');
  return { users, cookie };
}

function get(url: string, cookie: string) {
  return app.inject({ method: 'GET', url, headers: { cookie } }).then((r) => r.json());
}
function post(url: string, cookie: string, payload: unknown) {
  return app.inject({ method: 'POST', url, headers: { ...WEB_HEADERS, cookie }, payload });
}

/** A trimmed proposal in the shape of the proposal-generation tool's export. */
const SAMPLE_PROPOSAL = {
  companyName: 'May Mobility, Inc.',
  testType: 'Penetration Assessment',
  testApproach: 'Gray Box',
  engagementGoals: 'Retest the Fleet API and TeleAssist surfaces; assess FCC.',
  scopeDescription: 'Fleet API retest, TeleAssist retest, new FCC test.',
  estimatedStartDate: '2026-09-30',
  clientContacts: [{ name: 'Hemanth Tadepalli', title: 'SME', email: 'h@maymobility.com' }],
  blockHarborContacts: [{ name: 'Justin Montalbano', title: 'Director', email: 'j@bh.io' }],
  scopeExclusions: [{ id: 'x', text: 'Denial of Service (DoS)', checked: true }],
  devices: [
    {
      name: 'Fleet API',
      function: 'Data-access interface.',
      interfaces: [
        {
          name: 'REST API',
          category: 'Software / Application',
          subItems: ['Cryptographic Failures', 'W1-TLS Accepting Weak & Outdated Ciphers'],
        },
        { name: 'MQTT', category: 'Software / Application', subItems: ['Authentication'] },
      ],
    },
    {
      name: 'FCC (Fleet Command Control)',
      function: 'Command/dispatch layer.',
      interfaces: [{ name: 'Web API', category: 'Software / Application', subItems: [] }],
    },
  ],
};

describe('proposal import', () => {
  it('imports devices → targets/activities/goals and applies metadata', async () => {
    const { cookie } = await setup();
    const draft = proposalToImportDraft(SAMPLE_PROPOSAL);
    // The mapper drops the FCC target (no activities with names? it has "Web API"
    // with no sub-items — kept, no goals).
    const res = await post('/web/engagements/op1/proposal/import', cookie, {
      draft,
      mode: 'replace',
      applyMetadata: true,
      rawProposal: SAMPLE_PROPOSAL,
    });
    expect(res.statusCode).toBe(200);
    const result = res.json();
    expect(result.targetsCreated).toBe(2); // Fleet API + FCC
    expect(result.activitiesCreated).toBe(3); // REST API, MQTT, Web API
    expect(result.goalsCreated).toBe(3); // 2 + 1 + 0
    expect(result.metadataApplied).toBe(true);

    const tree = await get('/web/engagements/op1/goals', cookie);
    expect(tree.targets).toHaveLength(2);
    const fleet = tree.targets.find((t: { name: string }) => t.name === 'Fleet API');
    expect(fleet.activities).toHaveLength(2);
    const rest = fleet.activities.find((a: { name: string }) => a.name === 'REST API');
    expect(rest.category).toBe('Software / Application');
    expect(rest.tagId).toBeTypeOf('number'); // auto-tag created
    const retest = rest.goals.find((g: { title: string }) => g.title.startsWith('W1-'));
    expect(retest.isRetest).toBe(true);
    const plain = rest.goals.find((g: { title: string }) => g.title === 'Cryptographic Failures');
    expect(plain.isRetest).toBe(false);
    expect(tree.progress.total).toBe(3);
    expect(tree.progress.percent).toBe(0);

    // Metadata landed on the engagement.
    const eng = await get('/web/engagements/op1', cookie);
    expect(eng.clientName).toBe('May Mobility, Inc.');
    expect(eng.assessmentType).toBe('Penetration Assessment');
    expect(eng.testApproach).toBe('Gray Box');
    expect(eng.scopeExclusions).toContain('Denial of Service (DoS)');
    expect(eng.providerContacts[0].name).toBe('Justin Montalbano');
    expect(eng.hasProposalImport).toBe(true);

    // The auto-tag is a real engagement tag usable on the timeline.
    const tags = await get('/web/engagements/op1/tags', cookie);
    expect(tags.map((t: { name: string }) => t.name)).toContain('REST API');

    // The structured Service-scope section is populated from the same devices:
    // each device → a scope target, its interfaces → in-scope subsystems.
    const fleetScope = eng.scopeTargets.find((t: { name: string }) => t.name === 'Fleet API');
    expect(fleetScope.subsystems).toEqual(['REST API', 'MQTT']);
    const fccScope = eng.scopeTargets.find((t: { name: string }) =>
      t.name.startsWith('FCC'),
    );
    expect(fccScope.subsystems).toEqual(['Web API']);

    // Finding categories are seeded from the proposal's weakness classes
    // (non-retest goals) + activity categories — but not the retest carryover.
    const cats = (await get('/web/engagements/op1/finding-categories', cookie)).map(
      (c: { category: string }) => c.category,
    );
    expect(cats).toContain('Cryptographic Failures');
    expect(cats).toContain('Authentication');
    expect(cats).toContain('Software / Application');
    expect(cats).not.toContain('W1-TLS Accepting Weak & Outdated Ciphers');
  });

  it('replace mode clears a prior import; merge appends', async () => {
    const { cookie } = await setup();
    const draft = proposalToImportDraft(SAMPLE_PROPOSAL);
    await post('/web/engagements/op1/proposal/import', cookie, { draft, mode: 'replace' });
    await post('/web/engagements/op1/proposal/import', cookie, { draft, mode: 'replace' });
    let tree = await get('/web/engagements/op1/goals', cookie);
    expect(tree.targets).toHaveLength(2); // replaced, not doubled

    await post('/web/engagements/op1/proposal/import', cookie, { draft, mode: 'merge' });
    tree = await get('/web/engagements/op1/goals', cookie);
    expect(tree.targets).toHaveLength(4); // appended
  });
});

describe('goals CRUD, linking, and progress', () => {
  it('creates a target/activity/goal, links a finding, and rolls up progress', async () => {
    const { cookie } = await setup();

    const target = (await post('/web/engagements/op1/targets', cookie, { name: 'API' }).then((r) =>
      r.json(),
    )) as { id: number };
    const activity = (await post(
      `/web/engagements/op1/targets/${target.id}/activities`,
      cookie,
      { name: 'REST', category: 'Software' },
    ).then((r) => r.json())) as { id: number };
    const goal = (await post(
      `/web/engagements/op1/activities/${activity.id}/goals`,
      cookie,
      { title: 'AuthZ' },
    ).then((r) => r.json())) as { id: number; status: string };
    expect(goal.status).toBe('not_started');

    // A fresh engagement with one not-started goal is 0%.
    let tree = await get('/web/engagements/op1/goals', cookie);
    expect(tree.progress).toMatchObject({ total: 1, complete: 0, percent: 0 });

    // Link a finding → the goal auto-advances to in_progress.
    const finding = await post('/web/engagements/op1/findings', cookie, {
      title: 'Broken AuthZ',
      description: '',
      category: null,
    }).then((r) => r.json());
    const link = await post(`/web/engagements/op1/goals/${goal.id}/findings`, cookie, {
      findingUuids: [finding.uuid],
    });
    expect(link.statusCode).toBe(200);

    tree = await get('/web/engagements/op1/goals', cookie);
    const g = tree.targets[0].activities[0].goals[0];
    expect(g.status).toBe('in_progress');
    expect(g.numFindings).toBe(1);
    expect(tree.progress).toMatchObject({ total: 1, inProgress: 1, percent: 0 });

    // The finding lists the goal it's linked to.
    const linked = await get(`/web/engagements/op1/goals/for-finding/${finding.uuid}`, cookie);
    expect(linked).toHaveLength(1);
    expect(linked[0]).toMatchObject({ title: 'AuthZ', targetName: 'API', activityName: 'REST' });

    // Mark complete → 100%.
    await app.inject({
      method: 'PUT',
      url: `/web/engagements/op1/goals/${g.id}`,
      headers: { ...WEB_HEADERS, cookie },
      payload: { status: 'complete' },
    });
    tree = await get('/web/engagements/op1/goals', cookie);
    expect(tree.progress).toMatchObject({ total: 1, complete: 1, percent: 100 });

    // Progress surfaces on the engagement list too.
    const list = await get('/web/engagements', cookie);
    expect(list[0].progress).toMatchObject({ total: 1, complete: 1, percent: 100 });
  });

  it('excludes not-applicable goals from the completion denominator', async () => {
    const { cookie } = await setup();
    const t = await post('/web/engagements/op1/targets', cookie, { name: 'T' }).then((r) =>
      r.json(),
    );
    const a = await post(`/web/engagements/op1/targets/${t.id}/activities`, cookie, {
      name: 'A',
    }).then((r) => r.json());
    const mk = (title: string) =>
      post(`/web/engagements/op1/activities/${a.id}/goals`, cookie, { title }).then((r) => r.json());
    const g1 = await mk('one');
    const g2 = await mk('two');
    const g3 = await mk('three');
    const setStatus = (id: number, status: string) =>
      app.inject({
        method: 'PUT',
        url: `/web/engagements/op1/goals/${id}`,
        headers: { ...WEB_HEADERS, cookie },
        payload: { status },
      });
    await setStatus(g1.id, 'complete');
    await setStatus(g2.id, 'not_applicable');
    // g3 not_started. Denominator = total(3) - na(1) = 2; complete 1 → 50%.
    const tree = await get('/web/engagements/op1/goals', cookie);
    expect(tree.progress).toMatchObject({ total: 3, complete: 1, notApplicable: 1, percent: 50 });
    void g3;
  });

  it('rejects operating on a target from another engagement', async () => {
    const { cookie, users } = await setup();
    await app.db.engagement.create({
      data: {
        slug: 'op2',
        name: 'Op Two',
        roles: { create: [{ userId: users.writer.id, role: 'write' }] },
        targets: { create: { name: 'Foreign', position: 0 } },
      },
    });
    const foreign = await app.db.engagementTarget.findFirstOrThrow({ where: { name: 'Foreign' } });
    const res = await app.inject({
      method: 'DELETE',
      url: `/web/engagements/op1/targets/${foreign.id}`,
      headers: { ...WEB_HEADERS, cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('report configuration', () => {
  it('round-trips a report config and defaults to the canonical flow', async () => {
    const { cookie } = await setup();
    // Unconfigured engagement returns the canonical default (scopeCoverage off).
    const before = await get('/web/engagements/op1', cookie);
    expect(before.reportConfig.sections.some((s: { key: string }) => s.key === 'scopeCoverage')).toBe(
      true,
    );
    const cov = before.reportConfig.sections.find(
      (s: { key: string }) => s.key === 'scopeCoverage',
    );
    expect(cov.enabled).toBe(false);

    const res = await app.inject({
      method: 'PUT',
      url: '/web/engagements/op1',
      headers: { ...WEB_HEADERS, cookie: await loginCookie(app, 'admin@test.local', 'password123') },
      payload: {
        reportConfig: {
          sections: [
            { key: 'scopeCoverage', enabled: true },
            { key: 'executiveSummary', enabled: true },
          ],
          includeAllFindings: true,
          includeEvidenceTimeline: false,
          evidenceGroup: 'tag',
          customSections: [{ id: 'intro', title: 'Intro', body: 'Hello' }],
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const after = await get('/web/engagements/op1', cookie);
    expect(after.reportConfig.includeAllFindings).toBe(true);
    expect(after.reportConfig.evidenceGroup).toBe('tag');
    expect(after.reportConfig.sections[0].key).toBe('scopeCoverage');
    expect(after.reportConfig.customSections[0].title).toBe('Intro');
  });

  it('config-driven JSON export always uses only Ready-to-report findings', async () => {
    const { cookie } = await setup();
    // One ready + one not-ready finding.
    const ready = await post('/web/engagements/op1/findings', cookie, {
      title: 'Ready',
      description: '',
      category: null,
    }).then((r) => r.json());
    await app.inject({
      method: 'PUT',
      url: `/web/engagements/op1/findings/${ready.uuid}`,
      headers: { ...WEB_HEADERS, cookie },
      payload: { readyToReport: true },
    });
    await post('/web/engagements/op1/findings', cookie, {
      title: 'Draft',
      description: '',
      category: null,
    });

    // Default config → only ready findings in report.json.
    let exp = await get('/web/engagements/op1/report.json', cookie);
    expect(exp.findings.map((f: { title: string }) => f.title)).toEqual(['Ready']);

    // The "include all findings" report-config option was retired from the UI:
    // config-driven exports are always Ready-only, even if a stored config still
    // carries the (now-vestigial) flag. (The legacy /findings/export.json route
    // keeps its own `includeAll` query param for the client API.)
    await app.inject({
      method: 'PUT',
      url: '/web/engagements/op1',
      headers: { ...WEB_HEADERS, cookie: await loginCookie(app, 'admin@test.local', 'password123') },
      payload: { reportConfig: { includeAllFindings: true } },
    });
    exp = await get('/web/engagements/op1/report.json', cookie);
    expect(exp.findings.map((f: { title: string }) => f.title)).toEqual(['Ready']);
  });
});
