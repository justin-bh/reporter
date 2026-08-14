/**
 * Findings report generation: a portable JSON export (also the import format)
 * and a self-contained HTML document rendered to PDF by the report route.
 *
 * Both share one gather step so the PDF and the JSON always describe the same
 * findings in the same order. Evidence order follows the per-finding manual
 * order (EvidenceFinding.position).
 */
import type { FastifyInstance } from 'fastify';
import {
  FINDINGS_EXPORT_VERSION,
  SEVERITY_LABELS,
  tagColor,
  type FindingsExport,
  type Severity,
} from '@reporter/shared';
import { evidenceContentMime } from '../routes/shared-evidence.js';

interface GatheredEvidence {
  uuid: string;
  description: string;
  contentType: string;
  contentSubtype: string | null;
  occurredAt: Date;
  fullBlobKey: string | null;
}

interface GatheredFinding {
  uuid: string;
  title: string;
  description: string;
  category: string | null;
  severity: Severity | null;
  cvssVector: string | null;
  cvssScore: number | null;
  readyToReport: boolean;
  ticketLink: string | null;
  position: number;
  evidence: GatheredEvidence[];
}

export interface ReportOptions {
  /** Include every finding; otherwise only `readyToReport` findings. */
  includeAll?: boolean;
}

export interface JsonExportOptions extends ReportOptions {
  /** Embed evidence blob content as base64 (makes the export portable). */
  includeEvidenceContent?: boolean;
}

interface EngagementRef {
  id: number;
  slug: string;
  name: string;
}

/** Load the report's findings (filtered + ordered) with their ordered evidence. */
async function gather(
  app: FastifyInstance,
  eng: EngagementRef,
  opts: ReportOptions,
): Promise<GatheredFinding[]> {
  const findings = await app.db.finding.findMany({
    where: { engagementId: eng.id, ...(opts.includeAll ? {} : { readyToReport: true }) },
    include: {
      category: true,
      evidence: {
        orderBy: [{ position: 'asc' }, { evidenceId: 'asc' }],
        include: { evidence: true },
      },
    },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });

  return findings.map((f) => ({
    uuid: f.uuid,
    title: f.title,
    description: f.description,
    category: f.category?.category ?? null,
    severity: f.severity,
    cvssVector: f.cvssVector,
    cvssScore: f.cvssScore,
    readyToReport: f.readyToReport,
    ticketLink: f.ticketLink,
    position: f.position,
    evidence: f.evidence.map((link) => ({
      uuid: link.evidence.uuid,
      description: link.evidence.description,
      contentType: link.evidence.contentType,
      contentSubtype: link.evidence.contentSubtype,
      occurredAt: link.evidence.occurredAt,
      fullBlobKey: link.evidence.fullBlobKey,
    })),
  }));
}

// ---------------------------------------------------------------------------
// JSON export (report.json) — also the import envelope
// ---------------------------------------------------------------------------

export async function buildFindingsExport(
  app: FastifyInstance,
  eng: EngagementRef,
  exportedAt: Date,
  opts: JsonExportOptions,
): Promise<FindingsExport> {
  const findings = await gather(app, eng, opts);

  const out: FindingsExport['findings'] = [];
  for (const f of findings) {
    const evidence: FindingsExport['findings'][number]['evidence'] = [];
    for (const e of f.evidence) {
      const item: FindingsExport['findings'][number]['evidence'][number] = {
        uuid: e.uuid,
        description: e.description,
        contentType: e.contentType as (typeof evidence)[number]['contentType'],
        contentSubtype: e.contentSubtype,
        occurredAt: e.occurredAt.toISOString(),
      };
      if (opts.includeEvidenceContent && e.fullBlobKey) {
        const buf = await app.blobs.getBuffer(e.fullBlobKey).catch(() => null);
        if (buf) item.contentBase64 = buf.toString('base64');
      }
      evidence.push(item);
    }
    out.push({
      uuid: f.uuid,
      title: f.title,
      description: f.description,
      category: f.category,
      severity: f.severity,
      cvssVector: f.cvssVector,
      cvssScore: f.cvssScore,
      readyToReport: f.readyToReport,
      ticketLink: f.ticketLink,
      position: f.position,
      evidence,
    });
  }

  return {
    schemaVersion: FINDINGS_EXPORT_VERSION,
    exportedAt: exportedAt.toISOString(),
    engagement: { slug: eng.slug, name: eng.name },
    includesEvidenceContent: Boolean(opts.includeEvidenceContent),
    findings: out,
  };
}

// ---------------------------------------------------------------------------
// HTML report (rendered to PDF)
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function severityHex(sev: Severity): string {
  const name: Record<Severity, string> = {
    critical: 'red',
    high: 'orange',
    medium: 'amber',
    low: 'green',
    none: 'slate',
  };
  return tagColor(name[sev]).light;
}

function severityPill(sev: Severity | null, score: number | null): string {
  if (!sev) return '<span class="pill pill-none">Unrated</span>';
  const label = SEVERITY_LABELS[sev];
  const scoreTxt = score != null ? ` ${score.toFixed(1)}` : '';
  return `<span class="pill" style="background:${severityHex(sev)}">${esc(label)}${esc(scoreTxt)}</span>`;
}

// Memory bounds so a report with huge evidence can't exhaust the server:
// skip embedding any single image over the per-image cap, and stop embedding
// once the whole report's embedded base64 exceeds the total budget.
const IMAGE_EMBED_CAP = 8 * 1024 * 1024; // 8 MB per image
const TOTAL_EMBED_CAP = 64 * 1024 * 1024; // ~64 MB of base64 across the report

/** Render one piece of evidence to HTML, loading its blob if needed. */
async function renderEvidence(
  app: FastifyInstance,
  e: GatheredEvidence,
  budget: { remaining: number },
): Promise<string> {
  const caption = esc(e.description || e.contentType);

  // Never read a terminal recording — casts can be large and can't render
  // statically in a PDF. Reference it instead of pulling the blob into memory.
  if (e.contentType === 'terminal-recording') {
    return `<div class="ev"><p class="ev-note">▶ Terminal recording — view in reporter.</p><figcaption>${caption}</figcaption></div>`;
  }

  const buf = e.fullBlobKey ? await app.blobs.getBuffer(e.fullBlobKey).catch(() => null) : null;

  if (e.contentType === 'image') {
    if (!buf) return `<div class="ev"><p class="ev-note">${caption}</p></div>`;
    if (buf.length > IMAGE_EMBED_CAP || buf.length > budget.remaining) {
      const mb = (buf.length / (1024 * 1024)).toFixed(1);
      return `<div class="ev"><p class="ev-note">Screenshot (${mb} MB) — too large to embed; view in reporter.</p><figcaption>${caption}</figcaption></div>`;
    }
    const mime = evidenceContentMime('image', buf);
    const b64 = buf.toString('base64');
    budget.remaining -= b64.length;
    return `<figure class="ev"><img src="data:${mime};base64,${b64}" alt="${caption}" /><figcaption>${caption}</figcaption></figure>`;
  }
  if (buf) {
    let text = buf.toString('utf8');
    if (text.length > 20000) text = text.slice(0, 20000) + '\n… (truncated)';
    const lang = e.contentSubtype ? ` <span class="ev-lang">${esc(e.contentSubtype)}</span>` : '';
    return `<div class="ev"><figcaption>${caption}${lang}</figcaption><pre class="ev-code">${esc(text)}</pre></div>`;
  }
  return `<div class="ev"><p class="ev-note">${caption}</p></div>`;
}

export async function buildReportHtml(
  app: FastifyInstance,
  eng: EngagementRef,
  generatedAt: Date,
  opts: ReportOptions,
): Promise<string> {
  const findings = await gather(app, eng, opts);

  // Severity summary counts (most → least severe).
  const order: Severity[] = ['critical', 'high', 'medium', 'low', 'none'];
  const counts = new Map<Severity, number>();
  for (const f of findings)
    if (f.severity) counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1);
  const summary = order
    .filter((s) => counts.get(s))
    .map((s) => `<li>${severityPill(s, null)} × ${counts.get(s)}</li>`)
    .join('');

  const budget = { remaining: TOTAL_EMBED_CAP };
  const sections: string[] = [];
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i]!;
    // Render evidence sequentially so at most one blob is held in memory at once.
    const parts: string[] = [];
    for (const e of f.evidence) parts.push(await renderEvidence(app, e, budget));
    const evidenceHtml =
      f.evidence.length === 0 ? '<p class="muted">No evidence attached.</p>' : parts.join('\n');
    const meta: string[] = [];
    if (f.category) meta.push(`<strong>Category:</strong> ${esc(f.category)}`);
    if (f.cvssVector) meta.push(`<strong>CVSS:</strong> <code>${esc(f.cvssVector)}</code>`);
    if (f.ticketLink) meta.push(`<strong>Ticket:</strong> ${esc(f.ticketLink)}`);
    sections.push(`
      <section class="finding">
        <h2><span class="num">${i + 1}.</span> ${esc(f.title)} ${severityPill(f.severity, f.cvssScore)}</h2>
        ${meta.length ? `<p class="meta">${meta.join(' &nbsp;·&nbsp; ')}</p>` : ''}
        <div class="desc">${esc(f.description) || '<span class="muted">No description.</span>'}</div>
        <h3>Evidence (${f.evidence.length})</h3>
        ${evidenceHtml}
      </section>`);
  }

  const empty = findings.length === 0 ? '<p class="muted">No findings to report.</p>' : '';

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>${esc(eng.name)} — Findings Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 48px; font-size: 13px; line-height: 1.5; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  .sub { color: #666; margin: 0 0 24px; }
  .summary { border: 1px solid #ddd; border-radius: 8px; padding: 12px 16px; margin: 0 0 24px; }
  .summary ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 12px; }
  .finding { border-top: 2px solid #eee; padding-top: 16px; margin-top: 24px; page-break-inside: avoid; }
  .finding h2 { font-size: 17px; margin: 0 0 6px; }
  .finding h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #888; margin: 20px 0 8px; }
  .num { color: #aaa; }
  .meta { color: #444; margin: 0 0 8px; }
  .desc { white-space: pre-wrap; margin: 0 0 8px; }
  .muted { color: #999; }
  .pill { display: inline-block; color: #fff; border-radius: 999px; padding: 1px 9px; font-size: 11px; font-weight: 600; vertical-align: middle; }
  .pill-none { background: #888; }
  .ev { margin: 0 0 14px; page-break-inside: avoid; }
  .ev img { max-width: 100%; border: 1px solid #ddd; border-radius: 6px; }
  figcaption { color: #666; font-size: 12px; margin-top: 4px; }
  .ev-lang { background: #eee; border-radius: 4px; padding: 0 6px; font-size: 11px; }
  .ev-code { background: #f6f6f6; border: 1px solid #eee; border-radius: 6px; padding: 10px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .ev-note { color: #555; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
</style></head>
<body>
  <h1>${esc(eng.name)}</h1>
  <p class="sub">Findings Report · ${findings.length} finding${findings.length === 1 ? '' : 's'} · Generated ${generatedAt.toISOString().slice(0, 10)}</p>
  ${summary ? `<div class="summary"><strong>Severity summary</strong><ul>${summary}</ul></div>` : ''}
  ${empty}
  ${sections.join('\n')}
</body></html>`;
}
