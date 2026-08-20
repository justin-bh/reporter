import archiver from 'archiver';
import type { FastifyInstance } from 'fastify';
import type { PuppeteerNode } from 'puppeteer';
import {
  FINDINGS_EXPORT_VERSION,
  REPORT_PRESET_FILE_LABELS,
  evidenceGroupingSchema,
  findingsExportSchema,
  reportConfigSchema,
  reportPresetSchema,
  reportPresetSections,
  type EvidenceGrouping,
  type ReportConfig,
  type ReportPreset,
} from '@reporter/shared';
import { HttpError, requireAuth, requireEngagementRole } from '../../auth/guards.js';
import {
  buildFindingsExport,
  buildReportHtml,
  gatherSupportingFiles,
  type ReportOptions,
} from '../../services/findings-report.js';
import { importFindings } from '../../services/findings-import.js';

function boolParam(v: unknown): boolean {
  return v === 'true' || v === '1';
}

/** Parse the query param, defaulting to true unless explicitly "false"/"0". */
function boolParamDefaultTrue(v: unknown): boolean {
  return !(v === 'false' || v === '0');
}

/** Parse the evidence grouping, falling back to a safe default. */
function groupParam(v: unknown): EvidenceGrouping {
  const parsed = evidenceGroupingSchema.safeParse(v);
  return parsed.success ? parsed.data : 'chronological';
}

/**
 * A filename timestamp down to the second (local time), so repeated exports on
 * the same day get distinct names: `2026-08-20-143052`.
 */
function stamp(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(
    d.getMinutes(),
  )}${p(d.getSeconds())}`;
}

/** The `?preset` query param ("report type"), defaulting to the saved custom config. */
function presetParam(v: unknown): ReportPreset {
  const parsed = reportPresetSchema.safeParse(v);
  return parsed.success ? parsed.data : 'custom';
}

/** Report options parsed from the shared query params of the PDF and ZIP routes. */
function reportOptionsFromQuery(q: Record<string, string | undefined>): ReportOptions {
  return {
    includeAll: boolParam(q.includeAll),
    evidenceGroup: groupParam(q.evidenceGroup),
    // Narrative is the default Assessment Execution view; the timeline is opt-in.
    includeNarrative: boolParamDefaultTrue(q.includeNarrative),
    includeTimeline: boolParam(q.includeTimeline),
    includeAppendix: boolParamDefaultTrue(q.includeAppendix),
  };
}

/** Report options from a saved report configuration (the Reports section). */
function reportOptionsFromConfig(config: ReportConfig): ReportOptions {
  return {
    includeAll: config.includeAllFindings,
    evidenceGroup: config.evidenceGroup,
    includeTimeline: config.includeEvidenceTimeline,
    sections: config.sections,
    customSections: config.customSections,
  };
}

/**
 * Resolve a report "type" into render options and the filename fragment that
 * names it. `custom` renders the engagement's saved configuration; the canned
 * presets render a fixed section subset (report-ready findings, no timeline).
 */
function reportFor(
  config: ReportConfig,
  preset: ReportPreset,
): { options: ReportOptions; label: string } {
  const label = REPORT_PRESET_FILE_LABELS[preset];
  if (preset === 'custom') return { options: reportOptionsFromConfig(config), label };
  return {
    options: {
      includeAll: false,
      evidenceGroup: config.evidenceGroup,
      includeTimeline: false,
      sections: reportPresetSections(preset),
      customSections: [],
    },
    label,
  };
}

/**
 * Render an HTML document to a PDF buffer with headless Chromium. Puppeteer is
 * imported lazily so the server boots (and tests run) without it installed.
 */
async function renderPdf(app: FastifyInstance, html: string): Promise<Buffer> {
  let puppeteer: PuppeteerNode;
  try {
    puppeteer = (await import('puppeteer')).default;
  } catch (err) {
    app.log.error({ err }, 'puppeteer unavailable');
    throw new HttpError(501, 'PDF generation is not available on this server');
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    // Fonts load from Google Fonts when the host has network, but the render must
    // never block on them (Docker Chromium is often offline): give the network a
    // brief window, then fall back to the local font stacks.
    await page.setContent(html, { waitUntil: 'load' });
    // Runs in the browser context (not Node) — hence the `Function`-based evaluate
    // to keep it out of tsc's Node lib.
    const waitFonts = new Function(
      'return Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);',
    ) as () => Promise<unknown>;
    await page.evaluate(waitFonts).catch(() => undefined);
    // Page geometry (Letter, margins, running header/footer, page numbers) comes
    // entirely from the document's CSS @page + margin boxes.
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/** Findings export: portable JSON and a rendered PDF report. */
export async function reportRoutes(app: FastifyInstance): Promise<void> {
  // JSON export (also the import format). `includeEvidenceContent` embeds blobs
  // as base64 so the export can be re-imported into another server.
  app.get(
    '/engagements/:slug/findings/export.json',
    { preHandler: [requireAuth, requireEngagementRole('read')] },
    async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const q = req.query as Record<string, string | undefined>;
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const data = await buildFindingsExport(app, eng, new Date(), {
        includeAll: boolParam(q.includeAll),
        includeEvidenceContent: boolParam(q.includeEvidenceContent),
      });
      reply.header(
        'Content-Disposition',
        `attachment; filename="${slug}-findings-${stamp()}.json"`,
      );
      return data;
    },
  );

  // Import a findings export (report.json) into this engagement. The body can be
  // large when it embeds evidence content, so raise the per-route body limit.
  app.post(
    '/engagements/:slug/findings/import',
    {
      preHandler: [requireAuth, requireEngagementRole('write')],
      bodyLimit: app.config.MAX_UPLOAD_BYTES,
    },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const data = findingsExportSchema.parse(req.body);
      if (data.schemaVersion > FINDINGS_EXPORT_VERSION) {
        throw new HttpError(400, `Unsupported export schema version ${data.schemaVersion}`);
      }
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      return importFindings(app, { id: eng.id, slug: eng.slug }, data, req.authedUser!.id);
    },
  );

  // PDF report, rendered from HTML by headless Chromium.
  app.get(
    '/engagements/:slug/findings/report.pdf',
    { preHandler: [requireAuth, requireEngagementRole('read')] },
    async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const q = req.query as Record<string, string | undefined>;
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const html = await buildReportHtml(
        app,
        eng,
        new Date(),
        reportOptionsFromQuery(q),
        req.authedUser!.id,
      );
      const pdf = await renderPdf(app, html);
      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${slug}-findings-${stamp()}.pdf"`);
      return reply.send(pdf);
    },
  );

  // ZIP bundle: the PDF report plus every supporting file (non-screenshot
  // evidence — terminal recordings, HTTP cycles, uploaded files, etc.) so the
  // client can download the report and its raw evidence together. The bundle's
  // supporting-files match the report's "Files Attached" table exactly.
  app.get(
    '/engagements/:slug/findings/report.zip',
    { preHandler: [requireAuth, requireEngagementRole('read')] },
    async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const q = req.query as Record<string, string | undefined>;
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });

      // Compute the supporting-file set once (names + hashes) and reuse it for
      // both the report's Files Attached table and the ZIP entries.
      const files = await gatherSupportingFiles(app, eng);
      const html = await buildReportHtml(
        app,
        eng,
        new Date(),
        reportOptionsFromQuery(q),
        req.authedUser!.id,
        files,
      );
      const pdf = await renderPdf(app, html);

      const base = `${slug}-report-${stamp()}`;
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('warning', (err: unknown) => app.log.warn({ err }, 'zip warning'));
      archive.on('error', (err: unknown) => app.log.error({ err }, 'zip error'));

      reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', `attachment; filename="${base}.zip"`);
      // Begin streaming the archive to the response, then feed entries in so the
      // archiver drains as we go (bounded memory even for large supporting files).
      reply.send(archive);

      archive.append(pdf, { name: `${base}.pdf` });
      for (const f of files) {
        const buf = await app.blobs.getBuffer(f.blobKey).catch(() => null);
        if (buf) archive.append(buf, { name: `supporting-files/${f.filename}` });
      }
      if (files.length > 0) {
        const manifest =
          files.map((f) => `${f.sha256}  supporting-files/${f.filename}`).join('\n') + '\n';
        archive.append(manifest, { name: 'supporting-files/SHA256SUMS.txt' });
      }
      await archive.finalize();
      return reply;
    },
  );

  // --- Config-driven report generation (the Reports section) ---------------
  // These use the engagement's saved `reportConfig` (ordered/toggleable sections
  // + options) rather than query params. The legacy `/findings/*` routes above
  // stay for the client API and back-compat.

  app.get(
    '/engagements/:slug/report.pdf',
    { preHandler: [requireAuth, requireEngagementRole('read')] },
    async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const q = req.query as Record<string, string | undefined>;
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const config = reportConfigSchema.parse(eng.reportConfig ?? {});
      const { options, label } = reportFor(config, presetParam(q.preset));
      const html = await buildReportHtml(app, eng, new Date(), options, req.authedUser!.id);
      const pdf = await renderPdf(app, html);
      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${slug}-${label}-${stamp()}.pdf"`);
      return reply.send(pdf);
    },
  );

  app.get(
    '/engagements/:slug/report.zip',
    { preHandler: [requireAuth, requireEngagementRole('read')] },
    async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const q = req.query as Record<string, string | undefined>;
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const config = reportConfigSchema.parse(eng.reportConfig ?? {});
      const { options, label } = reportFor(config, presetParam(q.preset));
      const files = await gatherSupportingFiles(app, eng);
      const html = await buildReportHtml(
        app,
        eng,
        new Date(),
        options,
        req.authedUser!.id,
        files,
      );
      const pdf = await renderPdf(app, html);

      const base = `${slug}-${label}-${stamp()}`;
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('warning', (err: unknown) => app.log.warn({ err }, 'zip warning'));
      archive.on('error', (err: unknown) => app.log.error({ err }, 'zip error'));
      reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', `attachment; filename="${base}.zip"`);
      reply.send(archive);
      archive.append(pdf, { name: `${base}.pdf` });
      for (const f of files) {
        const buf = await app.blobs.getBuffer(f.blobKey).catch(() => null);
        if (buf) archive.append(buf, { name: `supporting-files/${f.filename}` });
      }
      if (files.length > 0) {
        const manifest =
          files.map((f) => `${f.sha256}  supporting-files/${f.filename}`).join('\n') + '\n';
        archive.append(manifest, { name: 'supporting-files/SHA256SUMS.txt' });
      }
      await archive.finalize();
      return reply;
    },
  );

  app.get(
    '/engagements/:slug/report.json',
    { preHandler: [requireAuth, requireEngagementRole('read')] },
    async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const q = req.query as Record<string, string | undefined>;
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const config = reportConfigSchema.parse(eng.reportConfig ?? {});
      const { options, label } = reportFor(config, presetParam(q.preset));
      const data = await buildFindingsExport(app, eng, new Date(), {
        includeAll: options.includeAll ?? false,
        includeEvidenceContent: boolParam(q.includeEvidenceContent),
      });
      reply.header(
        'Content-Disposition',
        `attachment; filename="${slug}-${label}-${stamp()}.json"`,
      );
      return data;
    },
  );
}
