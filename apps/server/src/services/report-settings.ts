import type { FastifyInstance } from 'fastify';
import type { ReportSettings as DbReportSettings } from '@prisma/client';

/**
 * The single report-branding row (id = 1). Created with schema defaults (Block
 * Harbor house style) on first read, so callers never deal with a missing row.
 * Shared by the admin settings route and the PDF report renderer.
 */
export async function getReportSettings(app: FastifyInstance): Promise<DbReportSettings> {
  return app.db.reportSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}
