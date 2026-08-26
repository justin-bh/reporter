import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, loginCookie, seedUsers, truncateAll, WEB_HEADERS } from './helpers.js';
import {
  findReportForLetter,
  listReportHistory,
  recordGeneratedReport,
} from '../src/services/report-history.js';
import { buildAttestationLetterHtml } from '../src/services/attestation-letter.js';

let app: FastifyInstance;

/** A minimal artifact payload for `recordGeneratedReport` in unit-style tests. */
function pdfArtifact(text = 'PDF-BYTES') {
  return {
    buffer: Buffer.from(text),
    contentType: 'application/pdf',
    filename: 'acme-report.pdf',
  };
}

beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await truncateAll(app);
});

/** An engagement with report metadata + three severity-rated weaknesses. */
async function setup() {
  const users = await seedUsers(app);
  const eng = await app.db.engagement.create({
    data: {
      slug: 'acme',
      name: 'Acme Fleet Assessment',
      clientName: 'Acme, Inc.',
      assessmentType: 'Penetration Test',
      methodology: 'We tested things thoroughly.',
      startedAt: new Date('2025-08-18T00:00:00Z'),
      actualEndAt: new Date('2025-09-22T00:00:00Z'),
      scopeTargets: [{ name: 'Fleet API', subsystems: ['REST', 'MQTT'] }],
      scopeExclusions: ['AWS-provided infrastructure'],
      providerContacts: [
        { name: 'Justin Montalbano', title: 'Director of Offensive Security', email: 'justin@bh.io' },
      ],
      clientContacts: [{ name: 'Hemanth Tadepalli', title: 'Security SME', email: 'h@acme.io' }],
      roles: { create: [{ userId: users.writer.id, role: 'admin' }] },
    },
  });
  // Three weaknesses: one High, one Medium, one Low.
  for (const sev of ['high', 'medium', 'low'] as const) {
    await app.db.finding.create({
      data: {
        engagementId: eng.id,
        title: `W-${sev}`,
        kind: 'weakness',
        severity: sev,
        readyToReport: true,
      },
    });
  }
  const cookie = await loginCookie(app, 'writer@test.local', 'password123');
  return { users, eng, cookie };
}

describe('report history', () => {
  it('records generations with incrementing versions and a findings snapshot', async () => {
    const { users, eng } = await setup();
    await recordGeneratedReport(app, {
      eng,
      preset: 'full',
      format: 'pdf',
      options: { includeAll: true },
      userId: users.writer.id,
      artifact: pdfArtifact(),
    });
    await recordGeneratedReport(app, {
      eng,
      preset: 'findings',
      format: 'zip',
      options: { includeAll: true },
      userId: users.writer.id,
      artifact: { buffer: Buffer.from('ZIP-BYTES'), contentType: 'application/zip', filename: 'acme.zip' },
    });

    const history = await listReportHistory(app, eng.id);
    expect(history).toHaveLength(2);
    // Newest first.
    expect(history[0]!.version).toBe('v2.0');
    expect(history[0]!.format).toBe('zip');
    expect(history[1]!.version).toBe('v1.0');
    expect(history[1]!.generatedBy).toBe('Wendy Writer');

    const snap = history[1]!.summary;
    expect(snap.weaknessesTotal).toBe(3);
    expect(snap.bySeverity).toMatchObject({ critical: 0, high: 1, medium: 1, low: 1, none: 0 });
    expect(snap.highestSeverity).toBe('high');
    expect(snap.overallRisk).toBe('high');
  });

  it('exposes history over the web route (newest first)', async () => {
    const { users, eng, cookie } = await setup();
    await recordGeneratedReport(app, {
      eng,
      preset: 'full',
      format: 'pdf',
      options: { includeAll: true },
      userId: users.writer.id,
      artifact: pdfArtifact(),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/web/engagements/acme/reports/history',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].version).toBe('v1.0');
    expect(body[0].label).toBe('Full report');
  });
});

describe('attestation letter', () => {
  it('is gated on an existing report (409 before any generation)', async () => {
    const { cookie } = await setup();
    const res = await app.inject({
      method: 'GET',
      url: '/web/engagements/acme/attestation-letter.pdf?framework=soc2',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(409);
  });

  it('builds a SOC 2 letter from the report snapshot and engagement metadata', async () => {
    const { users, eng } = await setup();
    await recordGeneratedReport(app, {
      eng,
      preset: 'full',
      format: 'pdf',
      options: { includeAll: true },
      userId: users.writer.id,
      artifact: pdfArtifact(),
    });
    const report = await findReportForLetter(app, eng.id);
    expect(report).not.toBeNull();

    const html = await buildAttestationLetterHtml(app, report!, new Date('2026-08-26T00:00:00Z'), {
      framework: 'soc2',
      // Exclusions are opt-in now; enable them so the exclusions assertion holds.
      showExclusions: true,
    });

    // Structure + data mapping.
    expect(html).toContain('ATTESTATION LETTER'); // running header
    expect(html).toContain('Attestation of Independent Penetration Test'); // title (assessmentType)
    expect(html).toContain('Acme, Inc.'); // client
    expect(html).toContain('Attn: Hemanth Tadepalli'); // recipient (first client contact)
    expect(html).toContain('Report v1.0'); // the attested report
    expect(html).toContain('August 18, 2025 – September 22, 2025'); // testing period
    expect(html).toContain('Fleet API'); // scope bullet
    expect(html).toContain('AWS-provided infrastructure'); // exclusions (showExclusions)
    expect(html).toContain('We tested things thoroughly.'); // methodology
    expect(html).toContain('three (3) weaknesses'); // results intro
    expect(html).toContain('severity of High'); // highest severity
    expect(html).toContain('overall risk of the assessed scope as High'); // overall risk default
    expect(html).toContain('Justin Montalbano'); // signatory (first provider contact)

    // SOC 2-specific framework copy.
    expect(html).toContain('SOC 2 compliance activities');
    expect(html).toContain('Trust Services Criteria');
    expect(html).toContain('CC4.1');
    expect(html).toContain('AICPA');
  });

  it('tailors the framework copy (PCI DSS) and honors a custom framework label + risk override', async () => {
    const { users, eng } = await setup();
    await recordGeneratedReport(app, {
      eng,
      preset: 'full',
      format: 'pdf',
      options: { includeAll: true },
      userId: users.writer.id,
      artifact: pdfArtifact(),
    });
    const report = (await findReportForLetter(app, eng.id))!;

    const pci = await buildAttestationLetterHtml(app, report, new Date(), { framework: 'pci_dss' });
    expect(pci).toContain('Requirement 11.4');
    expect(pci).toContain('QSA');
    expect(pci).not.toContain('Trust Services Criteria');

    const custom = await buildAttestationLetterHtml(app, report, new Date(), {
      framework: 'custom',
      frameworkLabel: 'HITRUST',
      overallRisk: 'medium',
    });
    expect(custom).toContain('HITRUST compliance activities');
    expect(custom).toContain('overall risk of the assessed scope as Medium');
  });

  it('quotes the highest-rated weakness from a single finding (no label/score mismatch)', async () => {
    const users = await seedUsers(app);
    const eng = await app.db.engagement.create({
      data: { slug: 'mix', name: 'Mixed', clientName: 'Mix Co', roles: { create: [] } },
    });
    // A: manually rated Critical with NO CVSS score (the finding route clears the
    // score on a manual severity). B: a lower, but CVSS-scored, High.
    await app.db.finding.create({
      data: { engagementId: eng.id, title: 'A', kind: 'weakness', severity: 'critical' },
    });
    await app.db.finding.create({
      data: { engagementId: eng.id, title: 'B', kind: 'weakness', severity: 'high', cvssScore: 8.9 },
    });
    await recordGeneratedReport(app, {
      eng,
      preset: 'full',
      format: 'pdf',
      options: { includeAll: true },
      userId: users.writer.id,
      artifact: pdfArtifact(),
    });
    const report = (await findReportForLetter(app, eng.id))!;
    const html = await buildAttestationLetterHtml(app, report, new Date(), { framework: 'soc2' });
    // The top weakness is the Critical (no score) — must not borrow B's 8.9.
    expect(html).toContain('severity of Critical');
    expect(html).not.toContain('8.9');
  });

  it('omits exclusions by default and includes them when showExclusions is set', async () => {
    const { users, eng } = await setup();
    await recordGeneratedReport(app, {
      eng,
      preset: 'full',
      format: 'pdf',
      options: { includeAll: true },
      userId: users.writer.id,
      artifact: pdfArtifact(),
    });
    const report = (await findReportForLetter(app, eng.id))!;

    const off = await buildAttestationLetterHtml(app, report, new Date(), { framework: 'soc2' });
    expect(off).not.toContain('AWS-provided infrastructure');
    expect(off).not.toContain('Exclusions');

    const on = await buildAttestationLetterHtml(app, report, new Date(), {
      framework: 'soc2',
      showExclusions: true,
    });
    expect(on).toContain('Exclusions');
    expect(on).toContain('AWS-provided infrastructure');
  });

  it('renders exclusions even when the engagement has no scope targets', async () => {
    const users = await seedUsers(app);
    // No scopeTargets and no scope prose, but exclusions are present.
    const eng = await app.db.engagement.create({
      data: {
        slug: 'noscope',
        name: 'No Scope Co',
        clientName: 'NS Inc',
        scopeExclusions: ['Third-party SaaS integrations'],
        roles: { create: [] },
      },
    });
    await app.db.finding.create({
      data: { engagementId: eng.id, title: 'W', kind: 'weakness', severity: 'low' },
    });
    await recordGeneratedReport(app, {
      eng,
      preset: 'full',
      format: 'pdf',
      options: { includeAll: true },
      userId: users.writer.id,
      artifact: pdfArtifact(),
    });
    const report = (await findReportForLetter(app, eng.id))!;

    const on = await buildAttestationLetterHtml(app, report, new Date(), {
      framework: 'soc2',
      showExclusions: true,
    });
    // The latent bug: previously exclusions only rendered with scope targets.
    expect(on).toContain('Scope of Assessment');
    expect(on).toContain('Third-party SaaS integrations');

    const off = await buildAttestationLetterHtml(app, report, new Date(), { framework: 'soc2' });
    expect(off).not.toContain('Third-party SaaS integrations');
  });

  it('lets salutationName override the "Dear …" greeting', async () => {
    const { users, eng } = await setup();
    await recordGeneratedReport(app, {
      eng,
      preset: 'full',
      format: 'pdf',
      options: { includeAll: true },
      userId: users.writer.id,
      artifact: pdfArtifact(),
    });
    const report = (await findReportForLetter(app, eng.id))!;

    // Default: falls back to the resolved recipient (first client contact).
    const dflt = await buildAttestationLetterHtml(app, report, new Date(), { framework: 'soc2' });
    expect(dflt).toContain('Dear Hemanth Tadepalli,');

    const custom = await buildAttestationLetterHtml(app, report, new Date(), {
      framework: 'soc2',
      salutationName: 'Compliance Team',
    });
    expect(custom).toContain('Dear Compliance Team,');
    // Attn line still uses the recipient, not the salutation override.
    expect(custom).toContain('Attn: Hemanth Tadepalli');
  });
});

describe('report artifact storage + download', () => {
  it('records history as downloadable with a size and serves the stored bytes', async () => {
    const { users, eng, cookie } = await setup();
    const bytes = Buffer.from('%PDF-1.4 stored report bytes');
    await recordGeneratedReport(app, {
      eng,
      preset: 'full',
      format: 'pdf',
      options: { includeAll: true },
      userId: users.writer.id,
      artifact: { buffer: bytes, contentType: 'application/pdf', filename: 'acme-full.pdf' },
    });

    const history = await listReportHistory(app, eng.id);
    expect(history).toHaveLength(1);
    expect(history[0]!.downloadable).toBe(true);
    expect(history[0]!.sizeBytes).toBe(bytes.length);

    const uuid = history[0]!.uuid;
    const res = await app.inject({
      method: 'GET',
      url: `/web/engagements/acme/reports/${uuid}/download`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('acme-full.pdf');
    expect(res.rawPayload.equals(bytes)).toBe(true);
  });

  it('404s downloading an unknown report or one without stored bytes', async () => {
    const { users, eng, cookie } = await setup();
    // A row with no blobKey (simulating a pre-storage record): insert directly.
    const row = await app.db.generatedReport.create({
      data: {
        engagementId: eng.id,
        preset: 'full',
        label: 'Full report',
        version: 'v1.0',
        format: 'pdf',
        summary: {},
        generatedById: users.writer.id,
      },
    });
    const noBytes = await app.inject({
      method: 'GET',
      url: `/web/engagements/acme/reports/${row.uuid}/download`,
      headers: { cookie },
    });
    expect(noBytes.statusCode).toBe(404);

    const missing = await app.inject({
      method: 'GET',
      url: `/web/engagements/acme/reports/00000000-0000-0000-0000-000000000000/download`,
      headers: { cookie },
    });
    expect(missing.statusCode).toBe(404);
  });

  it('records and stores a JSON report generated over the web route', async () => {
    const { cookie, eng } = await setup();
    const gen = await app.inject({
      method: 'GET',
      url: '/web/engagements/acme/report.json',
      headers: { cookie, ...WEB_HEADERS },
    });
    expect(gen.statusCode).toBe(200);
    expect(gen.headers['content-type']).toContain('application/json');
    expect(gen.headers['content-disposition']).toContain('.json');

    const history = await listReportHistory(app, eng.id);
    expect(history).toHaveLength(1);
    expect(history[0]!.format).toBe('json');
    expect(history[0]!.downloadable).toBe(true);
    expect(history[0]!.sizeBytes).toBeGreaterThan(0);

    // The stored bytes are byte-identical to what generation returned.
    const dl = await app.inject({
      method: 'GET',
      url: `/web/engagements/acme/reports/${history[0]!.uuid}/download`,
      headers: { cookie },
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.headers['content-type']).toContain('application/json');
    expect(dl.rawPayload.equals(gen.rawPayload)).toBe(true);
  });
});
