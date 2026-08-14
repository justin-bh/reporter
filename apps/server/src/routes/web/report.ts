import type { FastifyInstance } from 'fastify';
import type { PuppeteerNode } from 'puppeteer';
import { FINDINGS_EXPORT_VERSION, findingsExportSchema } from '@reporter/shared';
import { HttpError, requireAuth, requireEngagementRole } from '../../auth/guards.js';
import { buildFindingsExport, buildReportHtml } from '../../services/findings-report.js';
import { importFindings } from '../../services/findings-import.js';

function boolParam(v: unknown): boolean {
  return v === 'true' || v === '1';
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
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

  // PDF report, rendered from HTML by headless Chromium. Puppeteer is imported
  // lazily so the server boots (and tests run) without it installed/available.
  app.get(
    '/engagements/:slug/findings/report.pdf',
    { preHandler: [requireAuth, requireEngagementRole('read')] },
    async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const q = req.query as Record<string, string | undefined>;
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const html = await buildReportHtml(app, eng, new Date(), {
        includeAll: boolParam(q.includeAll),
      });

      let puppeteer: PuppeteerNode;
      try {
        puppeteer = (await import('puppeteer')).default;
      } catch (err) {
        app.log.error({ err }, 'puppeteer unavailable');
        return reply.status(501).send({ error: 'PDF generation is not available on this server' });
      }

      const browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'load' });
        const pdf = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' },
          displayHeaderFooter: true,
          headerTemplate: '<span></span>',
          footerTemplate:
            '<div style="width:100%;font-size:8px;color:#999;padding:0 14mm;text-align:right;">' +
            `${slug} · <span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
        });
        reply
          .header('Content-Type', 'application/pdf')
          .header('Content-Disposition', `attachment; filename="${slug}-findings-${stamp()}.pdf"`);
        return reply.send(Buffer.from(pdf));
      } finally {
        await browser.close();
      }
    },
  );
}
