/**
 * Findings report generation: a portable JSON export (also the import format)
 * and a self-contained, Block Harbor house-style HTML document rendered to PDF
 * by the report route.
 *
 * The JSON export and the per-finding evidence in the PDF share one gather step
 * so both describe the same findings in the same order. Evidence order follows
 * the per-finding manual order (EvidenceFinding.position).
 */
import type { FastifyInstance } from 'fastify';
import {
  EVIDENCE_GROUPING_LABELS,
  EVIDENCE_TYPE_LABELS,
  FINDINGS_EXPORT_VERSION,
  SEVERITY_LABELS,
  SEVERITY_RANK,
  tagColor,
  type EvidenceGrouping,
  type EvidenceType,
  type FindingsExport,
  type Severity,
} from '@reporter/shared';
import { evidenceContentMime } from '../routes/shared-evidence.js';
import { getReportSettings } from './report-settings.js';
import {
  FONT_LINKS,
  WATERMARK_OPACITY_VALUES,
  esc,
  prose,
  reportCss,
  watermarkCss,
  watermarkMarkup,
} from './report-style.js';

interface GatheredEvidence {
  uuid: string;
  description: string;
  contentType: string;
  contentSubtype: string | null;
  occurredAt: Date;
  fullBlobKey: string | null;
  /** Attack Path step caption for this link (empty for plain attached evidence). */
  caption: string;
  /** Which bucket the link is in: Attack Path (true) vs Attached Evidence (false). */
  inPath: boolean;
}

interface GatheredFinding {
  uuid: string;
  title: string;
  description: string;
  remediation: string;
  category: string | null;
  severity: Severity | null;
  cvssVector: string | null;
  cvssScore: number | null;
  readyToReport: boolean;
  position: number;
  evidence: GatheredEvidence[];
}

export interface ReportOptions {
  /** Include every finding; otherwise only `readyToReport` findings. */
  includeAll?: boolean;
  /** How the Assessment Execution evidence timeline is organized. */
  evidenceGroup?: EvidenceGrouping;
  /** Include the Assessment Execution (full evidence timeline) section. */
  includeTimeline?: boolean;
  /** Include the Severity & CVSS reference appendix. */
  includeAppendix?: boolean;
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
      // Attack Path first (inPath=true), then Attached Evidence, each ordered by
      // its own position. The export/report split the flat list back by `inPath`.
      evidence: {
        orderBy: [{ inPath: 'desc' }, { position: 'asc' }, { evidenceId: 'asc' }],
        include: { evidence: true },
      },
    },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });

  return findings.map((f) => ({
    uuid: f.uuid,
    title: f.title,
    description: f.description,
    remediation: f.remediation,
    category: f.category?.category ?? null,
    severity: f.severity,
    cvssVector: f.cvssVector,
    cvssScore: f.cvssScore,
    readyToReport: f.readyToReport,
    position: f.position,
    evidence: f.evidence.map((link) => ({
      uuid: link.evidence.uuid,
      description: link.evidence.description,
      contentType: link.evidence.contentType,
      contentSubtype: link.evidence.contentSubtype,
      occurredAt: link.evidence.occurredAt,
      fullBlobKey: link.evidence.fullBlobKey,
      caption: link.caption,
      inPath: link.inPath,
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
        caption: e.caption,
        inPath: e.inPath,
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
      remediation: f.remediation,
      category: f.category,
      severity: f.severity,
      cvssVector: f.cvssVector,
      cvssScore: f.cvssScore,
      readyToReport: f.readyToReport,
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
// HTML report (rendered to PDF) — Block Harbor house style
// ---------------------------------------------------------------------------

/** Severity ordering, most → least severe, used to sort findings and dashboards. */
const SEV_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'none'];

/** A severity pill using the CVSS-band color classes from the stylesheet. */
function severityPill(sev: Severity | null, score: number | null): string {
  if (!sev) return '<span class="pill pill-sev-none">Unrated</span>';
  const label = SEVERITY_LABELS[sev];
  const scoreTxt = score != null ? ` ${score.toFixed(1)}` : '';
  return `<span class="pill pill-sev-${sev}">${esc(label)}${esc(scoreTxt)}</span>`;
}

/** A small tag chip using the shared tag palette. */
function tagChip(name: string, colorName: string): string {
  const c = tagColor(colorName);
  return `<span class="chip" style="background:${c.light};color:${c.fg}">${esc(name)}</span>`;
}

/** Format a date as e.g. "August 18, 2026" (UTC, locale-independent). */
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
function longDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
function shortDateTime(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${y}-${mo}-${day} ${hh}:${mm}Z`;
}

// Memory bounds so a report with huge evidence can't exhaust the server:
// skip embedding any single image over the per-image cap, and stop embedding
// once the whole report's embedded base64 exceeds the total budget. The budget
// is shared across finding evidence AND the timeline for the whole document.
const IMAGE_EMBED_CAP = 8 * 1024 * 1024; // 8 MB per image
const TOTAL_EMBED_CAP = 64 * 1024 * 1024; // ~64 MB of base64 across the report

interface Budget {
  remaining: number;
}

/** Render one piece of evidence to HTML, loading its blob if needed. */
async function renderEvidence(
  app: FastifyInstance,
  e: GatheredEvidence,
  budget: Budget,
): Promise<string> {
  const caption = esc(e.description || EVIDENCE_TYPE_LABELS[e.contentType as EvidenceType] || e.contentType);

  // Never read a terminal recording — casts can be large and can't render
  // statically in a PDF. Reference it instead of pulling the blob into memory.
  if (e.contentType === 'terminal-recording') {
    return `<div class="ev"><p class="ev-note"><span class="play">▶</span> Terminal recording — view in reporter.</p><figcaption>${caption}</figcaption></div>`;
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

/** Render one numbered Attack Path step: its caption (if any) then its evidence. */
async function renderPathStep(
  app: FastifyInstance,
  e: GatheredEvidence,
  step: number,
  budget: Budget,
): Promise<string> {
  const captionHtml = e.caption ? `<p class="step-caption">${esc(e.caption)}</p>` : '';
  const evidenceHtml = await renderEvidence(app, e, budget);
  return `<div class="step"><p class="step-label">Step ${step}</p>${captionHtml}${evidenceHtml}</div>`;
}

/** Render one finding's detailed subsection (heading, meta, prose, evidence). */
async function renderFinding(
  app: FastifyInstance,
  f: GatheredFinding,
  index: number,
  budget: Budget,
): Promise<string> {
  // Split into the two buckets. `gather` already orders Attack Path first, each
  // bucket by its own position, so filtering preserves the intended order.
  const pathEvidence = f.evidence.filter((e) => e.inPath);
  const attachedEvidence = f.evidence.filter((e) => !e.inPath);

  const meta: string[] = [];
  meta.push(`<strong>Category:</strong> ${f.category ? esc(f.category) : 'Uncategorized'}`);
  if (f.cvssScore != null) meta.push(`<strong>CVSS:</strong> ${f.cvssScore.toFixed(1)}`);
  if (f.cvssVector) meta.push(`<code>${esc(f.cvssVector)}</code>`);

  const descHtml = prose(f.description) || '<p class="pp muted">No description provided.</p>';
  const remediationHtml = f.remediation.trim()
    ? `<h4 class="sub">Remediation</h4>${prose(f.remediation)}`
    : '';

  // Render evidence sequentially so at most one blob is held in memory at once.
  let pathHtml = '';
  if (pathEvidence.length > 0) {
    const steps: string[] = [];
    for (let s = 0; s < pathEvidence.length; s++) {
      steps.push(await renderPathStep(app, pathEvidence[s]!, s + 1, budget));
    }
    pathHtml = `<h4 class="sub">Attack Path (${pathEvidence.length})</h4><div class="path">${steps.join('\n')}</div>`;
  }

  const attachedParts: string[] = [];
  for (const e of attachedEvidence) attachedParts.push(await renderEvidence(app, e, budget));
  const attachedHtml =
    attachedEvidence.length > 0
      ? `<h4 class="sub">Attached Evidence (${attachedEvidence.length})</h4>${attachedParts.join('\n')}`
      : pathEvidence.length === 0
        ? '<p class="pp muted">No evidence attached.</p>'
        : '';

  return `
    <div class="finding">
      <div class="finding-head">
        <span class="finding-num">${String(index).padStart(2, '0')}</span>
        <span class="finding-title">${esc(f.title)}</span>
        ${severityPill(f.severity, f.cvssScore)}
      </div>
      <p class="finding-meta">${meta.join('<span class="sep">·</span>')}</p>
      <h4 class="sub">Description</h4>
      ${descHtml}
      ${remediationHtml}
      ${pathHtml}
      ${attachedHtml}
    </div>`;
}

interface TimelineEvidence {
  uuid: string;
  description: string;
  contentType: string;
  contentSubtype: string | null;
  occurredAt: Date;
  fullBlobKey: string | null;
  operatorName: string;
  tags: { name: string; colorName: string }[];
}

/** Render a single timeline evidence item (when / who / desc / tags / body). */
async function renderTimelineItem(
  app: FastifyInstance,
  e: TimelineEvidence,
  budget: Budget,
): Promise<string> {
  const tags = e.tags.length
    ? `<div class="tl-tags">${e.tags.map((t) => tagChip(t.name, t.colorName)).join('')}</div>`
    : '';
  const desc = e.description.trim() ? `<p class="tl-desc">${esc(e.description)}</p>` : '';
  const body = await renderEvidence(
    app,
    {
      uuid: e.uuid,
      description: '',
      contentType: e.contentType,
      contentSubtype: e.contentSubtype,
      occurredAt: e.occurredAt,
      fullBlobKey: e.fullBlobKey,
      caption: '',
      inPath: false,
    },
    budget,
  );
  return `
    <div class="tl-item">
      <div><span class="tl-when">${shortDateTime(e.occurredAt)}</span><span class="tl-who">${esc(e.operatorName)}</span></div>
      ${desc}
      ${tags}
      <div class="tl-body">${body}</div>
    </div>`;
}

/** Build the Assessment Execution section, grouped per the chosen strategy. */
async function renderTimeline(
  app: FastifyInstance,
  items: TimelineEvidence[],
  group: EvidenceGrouping,
  budget: Budget,
): Promise<string> {
  if (items.length === 0) return '<p class="pp muted">No evidence recorded for this engagement.</p>';

  if (group === 'chronological') {
    const parts: string[] = [];
    for (const e of items) parts.push(await renderTimelineItem(app, e, budget));
    return parts.join('\n');
  }

  // Build ordered groups. For `tag`, an item appears under each of its tags
  // (and "Untagged" when it has none). For `type`, under its content-type label.
  const groups = new Map<string, TimelineEvidence[]>();
  const order: string[] = [];
  const push = (key: string, e: TimelineEvidence) => {
    let arr = groups.get(key);
    if (!arr) {
      arr = [];
      groups.set(key, arr);
      order.push(key);
    }
    arr.push(e);
  };

  if (group === 'tag') {
    for (const e of items) {
      if (e.tags.length === 0) push('Untagged', e);
      else for (const t of e.tags) push(t.name, e);
    }
    order.sort((a, b) => (a === 'Untagged' ? 1 : b === 'Untagged' ? -1 : a.localeCompare(b)));
  } else {
    for (const e of items) {
      const label = EVIDENCE_TYPE_LABELS[e.contentType as EvidenceType] ?? e.contentType;
      push(label, e);
    }
    order.sort((a, b) => a.localeCompare(b));
  }

  const sections: string[] = [];
  for (const key of order) {
    const arr = groups.get(key)!;
    const parts: string[] = [];
    for (const e of arr) parts.push(await renderTimelineItem(app, e, budget));
    sections.push(
      `<h3 class="group-head">${esc(key)} <span class="group-count">(${arr.length})</span></h3>${parts.join('\n')}`,
    );
  }
  return sections.join('\n');
}

export async function buildReportHtml(
  app: FastifyInstance,
  eng: EngagementRef,
  generatedAt: Date,
  opts: ReportOptions,
): Promise<string> {
  const includeTimeline = opts.includeTimeline !== false;
  const includeAppendix = opts.includeAppendix !== false;
  const evidenceGroup: EvidenceGrouping = opts.evidenceGroup ?? 'chronological';

  const [settings, engagement, findings, members] = await Promise.all([
    getReportSettings(app),
    app.db.engagement.findUniqueOrThrow({ where: { id: eng.id } }),
    gather(app, eng, opts),
    app.db.userEngagementRole.findMany({
      where: { engagementId: eng.id },
      include: { user: true },
    }),
  ]);

  const accent = settings.accentColor || '#e82434';
  const orgName = settings.organizationName || 'Block Harbor';
  const footerNote = settings.footerNote || 'Confidential';

  // Sort findings by severity desc (critical→none, null last), then position.
  const sorted = [...findings].sort((a, b) => {
    const ra = a.severity ? SEVERITY_RANK[a.severity] : -1;
    const rb = b.severity ? SEVERITY_RANK[b.severity] : -1;
    if (ra !== rb) return rb - ra;
    return a.position - b.position;
  });

  // Severity distribution + key stats.
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, none: 0 };
  for (const f of sorted) if (f.severity) counts[f.severity]++;
  const scored = sorted.filter((f) => f.cvssScore != null);
  const highestCvss = scored.reduce((m, f) => Math.max(m, f.cvssScore!), 0);
  const avgCvss = scored.length
    ? scored.reduce((s, f) => s + f.cvssScore!, 0) / scored.length
    : 0;
  const rated = scored.length;

  const budget: Budget = { remaining: TOTAL_EMBED_CAP };

  // ---- Cover -------------------------------------------------------------
  const eyebrow = (engagement.assessmentType || 'Findings Report').toUpperCase();
  const preparedFor = engagement.clientName || engagement.name;
  const subtitleBits = [preparedFor];
  if (engagement.assessmentType) subtitleBits.push(engagement.assessmentType);
  const windowStart = engagement.startedAt;
  const windowEnd = engagement.actualEndAt ?? engagement.projectedEndAt;
  const windowStr = `${longDate(windowStart)} – ${longDate(windowEnd)}`;
  const statusLabel = engagement.status.charAt(0).toUpperCase() + engagement.status.slice(1);

  const logo = settings.logoDataUri
    ? `<img class="cover-logo" src="${esc(settings.logoDataUri)}" alt="${esc(orgName)}" />`
    : `<div class="cover-wordmark">${esc(orgName)}<span class="dot">.</span></div>`;

  const coverMeta = `
    <div class="cover-meta">
      <div class="cover-cell"><div class="k">Prepared for</div><div class="v">${esc(preparedFor)}</div></div>
      <div class="cover-cell"><div class="k">Prepared by</div><div class="v">${esc(orgName)}</div></div>
      <div class="cover-cell"><div class="k">Date</div><div class="v">${esc(longDate(generatedAt))}</div></div>
      <div class="cover-cell"><div class="k">Assessment window</div><div class="v">${esc(windowStr)}</div></div>
      <div class="cover-cell cover-cell-wide"><div class="k">Status</div><div class="v">${esc(statusLabel)}</div></div>
    </div>`;

  const cover = `
    <section class="cover">
      <div class="cover-top">${logo}</div>
      <div class="cover-mid">
        <hr class="cover-rule" />
        <div class="cover-eyebrow">${esc(eyebrow)}</div>
        <h1 class="cover-title">${esc(engagement.name)}</h1>
        <p class="cover-sub">${esc(subtitleBits.join(' — '))}</p>
        ${coverMeta}
      </div>
      <p class="cover-foot">${esc(footerNote)}</p>
    </section>`;

  // ---- Engagement Details (Document Information) --------------------------
  const memberRows =
    members.length > 0
      ? members
          .map(
            (m) =>
              `<div class="person"><div class="nm">${esc(`${m.user.firstName} ${m.user.lastName}`.trim())}</div><div class="rl">${esc(roleLabel(m.role))}</div></div>`,
          )
          .join('')
      : '<div class="person"><div class="rl muted">No team members recorded.</div></div>';

  const totalEvidenceCount = await app.db.evidence.count({
    where: { engagementId: eng.id, parentEvidenceId: null },
  });

  const detailsGrid = `
    <div class="grid2">
      <div class="info-cell"><div class="k">Client</div><div class="v">${esc(preparedFor)}</div></div>
      <div class="info-cell"><div class="k">Assessment type</div><div class="v">${esc(engagement.assessmentType || '—')}</div></div>
      <div class="info-cell"><div class="k">Location</div><div class="v">${esc(engagement.location || '—')}</div></div>
      <div class="info-cell"><div class="k">Status</div><div class="v">${esc(statusLabel)}</div></div>
      <div class="info-cell"><div class="k">Start date</div><div class="v mono">${esc(longDate(windowStart))}</div></div>
      <div class="info-cell"><div class="k">End date</div><div class="v mono">${esc(longDate(windowEnd))}</div></div>
      <div class="info-cell"><div class="k">Findings</div><div class="v mono">${sorted.length}</div></div>
      <div class="info-cell"><div class="k">Evidence</div><div class="v mono">${totalEvidenceCount}</div></div>
      <div class="info-cell info-cell-wide"><div class="k">Team members</div>${memberRows}</div>
    </div>`;

  const scopeBlock = engagement.scope?.trim()
    ? `<h3 class="block-h">Scope</h3>${prose(engagement.scope)}`
    : '';

  const detailsSection = `
    <section class="section">
      ${sectionHead('01', 'Document Information', 'Engagement Details')}
      ${detailsGrid}
      ${scopeBlock}
    </section>`;

  // ---- Table of Contents -------------------------------------------------
  const tocRows: string[] = [];
  let tocN = 1;
  const toc = (title: string) => {
    tocRows.push(tocItem(String(tocN++).padStart(2, '0'), title, false));
  };
  toc('Engagement Details');
  toc('Executive Summary');
  toc('Methodology & Approach');
  toc('Findings Summary');
  // Findings by title, numbered as sub-rows.
  sorted.forEach((f, i) => {
    tocRows.push(tocItem(`F${String(i + 1).padStart(2, '0')}`, f.title, true));
  });
  if (includeTimeline) toc('Assessment Execution');
  if (includeAppendix) toc('Appendix: Severity & CVSS Reference');

  const tocSection = `
    <section class="section">
      ${sectionHead('', 'Contents', 'Table of Contents', true)}
      <div class="toc">${tocRows.join('')}</div>
    </section>`;

  // ---- Executive Summary (dashboard) -------------------------------------
  const summaryProse = engagement.executiveSummary?.trim()
    ? prose(engagement.executiveSummary)
    : '';

  const total = sorted.length;
  const sevBar =
    total > 0
      ? `<div class="sev-bar">${SEV_ORDER.filter((s) => counts[s] > 0)
          .map(
            (s) =>
              `<span style="width:${((counts[s] / total) * 100).toFixed(3)}%;background:var(--sev-${s})"></span>`,
          )
          .join('')}</div>`
      : '';
  const sevCards = `<div class="sev-cards">${SEV_ORDER.map(
    (s) =>
      `<div class="sev-card ${s}"><div class="n">${counts[s]}</div><div class="l">${esc(SEVERITY_LABELS[s])}</div></div>`,
  ).join('')}</div>`;

  const windowDays =
    windowStart && windowEnd
      ? Math.max(1, Math.round((windowEnd.getTime() - windowStart.getTime()) / 86400000))
      : null;

  const statsStrip = `
    <div class="stats">
      <div class="stat"><div class="k">Total findings</div><div class="v">${total}</div></div>
      <div class="stat"><div class="k">Highest CVSS</div><div class="v">${rated ? highestCvss.toFixed(1) : '—'}</div></div>
      <div class="stat"><div class="k">Average CVSS</div><div class="v">${rated ? avgCvss.toFixed(1) : '—'}</div></div>
      <div class="stat"><div class="k">Total evidence</div><div class="v">${totalEvidenceCount}</div></div>
      <div class="stat"><div class="k">Window</div><div class="v">${windowDays ?? '—'}<span class="u"> days</span></div></div>
    </div>`;

  const glanceRows =
    sorted.length > 0
      ? sorted
          .map(
            (f, i) => `
        <tr>
          <td class="num">${i + 1}</td>
          <td class="title">${esc(f.title)}</td>
          <td>${esc(f.category || 'Uncategorized')}</td>
          <td>${severityPill(f.severity, null)}</td>
          <td class="num">${f.cvssScore != null ? f.cvssScore.toFixed(1) : '—'}</td>
          <td>${f.readyToReport ? 'Ready' : 'Draft'}</td>
        </tr>`,
          )
          .join('')
      : '<tr><td colspan="6" class="muted">No findings to report.</td></tr>';

  const glanceTable = `
    <h3 class="block-h">Findings at a Glance</h3>
    <table class="tbl">
      <thead><tr><th class="num">#</th><th>Title</th><th>Category</th><th>Severity</th><th class="num">CVSS</th><th>Status</th></tr></thead>
      <tbody>${glanceRows}</tbody>
    </table>`;

  // Category breakdown.
  const catCounts = new Map<string, number>();
  for (const f of sorted) {
    const key = f.category || 'Uncategorized';
    catCounts.set(key, (catCounts.get(key) ?? 0) + 1);
  }
  const catRows = [...catCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([cat, n]) => `<tr><td class="title">${esc(cat)}</td><td class="num">${n}</td></tr>`)
    .join('');
  const categoryTable =
    catCounts.size > 0
      ? `<h3 class="block-h">Category Breakdown</h3>
         <table class="tbl">
           <thead><tr><th>Category</th><th class="num">Findings</th></tr></thead>
           <tbody>${catRows}</tbody>
         </table>`
      : '';

  const execSection = `
    <section class="section">
      ${sectionHead('02', 'Overview', 'Executive Summary')}
      ${summaryProse}
      <h3 class="block-h">Severity Distribution</h3>
      ${sevBar}
      ${sevCards}
      ${statsStrip}
      ${glanceTable}
      ${categoryTable}
    </section>`;

  // ---- Methodology & Approach --------------------------------------------
  const methodologyProse = engagement.methodology?.trim()
    ? prose(engagement.methodology)
    : `<p class="pp">This assessment followed a structured, evidence-driven methodology: reconnaissance and scoping, active testing against the in-scope surface, verification and impact analysis of each issue, and consolidation of results into the prioritized findings that follow. Every finding is supported by the captured evidence recorded during the engagement.</p>`;
  // Scope is surfaced on the Engagement Details page whenever it is present, so
  // it only appears here (under the methodology prose) when Details omitted it —
  // which is exactly when it is empty, i.e. there is nothing extra to show.
  const methodSection = `
    <section class="section">
      ${sectionHead('03', 'Approach', 'Methodology & Approach')}
      ${methodologyProse}
    </section>`;

  // ---- Findings (detailed) -----------------------------------------------
  const findingBlocks: string[] = [];
  if (sorted.length === 0) {
    findingBlocks.push('<p class="pp muted">No findings to report.</p>');
  } else {
    for (let i = 0; i < sorted.length; i++) {
      findingBlocks.push(await renderFinding(app, sorted[i]!, i + 1, budget));
    }
  }
  const findingsSection = `
    <section class="section">
      ${sectionHead('04', 'Detailed Results', 'Findings')}
      ${findingBlocks.join('\n')}
    </section>`;

  // ---- Assessment Execution (timeline) -----------------------------------
  let timelineSection = '';
  if (includeTimeline) {
    const evidence = await app.db.evidence.findMany({
      where: { engagementId: eng.id, parentEvidenceId: null },
      include: { tags: { include: { tag: true } }, operator: true },
      orderBy: { occurredAt: 'asc' },
    });
    const tlItems: TimelineEvidence[] = evidence.map((e) => ({
      uuid: e.uuid,
      description: e.description,
      contentType: e.contentType,
      contentSubtype: e.contentSubtype,
      occurredAt: e.occurredAt,
      fullBlobKey: e.fullBlobKey,
      operatorName: `${e.operator.firstName} ${e.operator.lastName}`.trim() || 'Unknown',
      tags: e.tags.map((t) => ({ name: t.tag.name, colorName: t.tag.colorName })),
    }));
    const groupLabel = EVIDENCE_GROUPING_LABELS[evidenceGroup];
    const body = await renderTimeline(app, tlItems, evidenceGroup, budget);
    timelineSection = `
    <section class="section">
      ${sectionHead('05', `Evidence Log · ${groupLabel}`, 'Assessment Execution')}
      ${body}
    </section>`;
  }

  // ---- Appendix: Severity & CVSS Reference -------------------------------
  let appendixSection = '';
  if (includeAppendix) {
    const bands: { sev: Severity; range: string; desc: string }[] = [
      { sev: 'critical', range: '9.0 – 10.0', desc: 'Immediate risk; likely leads to full compromise. Remediate urgently.' },
      { sev: 'high', range: '7.0 – 8.9', desc: 'Serious risk; significant impact or ease of exploitation. Prioritize.' },
      { sev: 'medium', range: '4.0 – 6.9', desc: 'Moderate risk; meaningful impact, often requiring specific conditions.' },
      { sev: 'low', range: '0.1 – 3.9', desc: 'Limited risk; minor impact or difficult to exploit.' },
      { sev: 'none', range: '0.0', desc: 'Informational; no direct security impact.' },
    ];
    const rows = bands
      .map(
        (b) =>
          `<tr><td>${severityPill(b.sev, null)}</td><td class="num">${b.range}</td><td>${esc(b.desc)}</td></tr>`,
      )
      .join('');
    appendixSection = `
    <section class="section">
      ${sectionHead('06', 'Reference', 'Severity & CVSS Reference')}
      <p class="lede">Severity ratings follow the CVSS v3.1 qualitative severity scale, derived from each finding's base score.</p>
      <table class="tbl">
        <thead><tr><th>Severity</th><th class="num">CVSS score</th><th>Description</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
  }

  // Running-header text (baked into the @page margin boxes).
  const hdrLeft = orgName.toUpperCase();
  const hdrRight = `${preparedFor.toUpperCase()} — ${footerNote.toUpperCase()}`;

  // ---- Watermark (every page but the cover) ------------------------------
  const wmText = engagement.watermarkText?.trim() || 'CONFIDENTIAL';
  const wmColor = engagement.watermarkColor || '#64748b';
  const wmOpacity =
    WATERMARK_OPACITY_VALUES[engagement.watermarkOpacity as keyof typeof WATERMARK_OPACITY_VALUES] ??
    WATERMARK_OPACITY_VALUES.medium;
  const wmLayer = engagement.watermarkLayer === 'front' ? 'front' : 'behind';
  const watermarkStyle = engagement.watermarkEnabled
    ? watermarkCss(wmColor, wmOpacity, wmLayer)
    : '';
  const watermark = engagement.watermarkEnabled ? watermarkMarkup(wmText) : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${esc(engagement.name)} — Findings Report</title>
${FONT_LINKS}
<style>${reportCss(accent, hdrLeft, hdrRight)}${watermarkStyle}</style>
</head>
<body>
  ${watermark}
  ${cover}
  ${detailsSection}
  ${tocSection}
  ${execSection}
  ${methodSection}
  ${findingsSection}
  ${timelineSection}
  ${appendixSection}
</body></html>`;
}

// ---------------------------------------------------------------------------
// Small HTML builders
// ---------------------------------------------------------------------------

/** A numbered section header (mono number + condensed kicker + heavy title). */
function sectionHead(num: string, kicker: string, title: string, noRule = false): string {
  const rule = noRule ? ' style="border-top:0;padding-top:0"' : '';
  const numHtml = num ? `<span class="sec-num">${esc(num)}</span>` : '<span class="sec-num"></span>';
  return `<div class="sec-head"${rule}>
    <div class="sec-kicker">${esc(kicker)}</div>
    ${numHtml}
    <h2 class="sec-title">${esc(title)}</h2>
  </div>`;
}

/** One table-of-contents row. */
function tocItem(n: string, title: string, sub: boolean): string {
  return `<div class="toc-item${sub ? ' sub' : ''}"><span class="toc-n">${esc(n)}</span><span class="toc-t">${esc(title)}</span><span class="toc-dot"></span></div>`;
}

/** Human label for an engagement role in the team-members list. */
function roleLabel(role: string): string {
  const map: Record<string, string> = { admin: 'Lead', write: 'Operator', read: 'Reviewer' };
  return map[role] ?? role;
}
