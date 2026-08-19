import type { FastifyInstance } from 'fastify';
import { updateReportSettingsInput } from '@reporter/shared';
import { requireAdmin, requireAuth } from '../../auth/guards.js';
import { serializeReportSettings } from '../../services/serializers.js';
import { getReportSettings } from '../../services/report-settings.js';

const adminGuard = [requireAuth, requireAdmin];

/** Site-wide report branding (organization name, accent color, cover logo). */
export async function reportSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/report-settings', { preHandler: adminGuard }, async () => {
    return serializeReportSettings(await getReportSettings(app));
  });

  app.put('/admin/report-settings', { preHandler: adminGuard }, async (req) => {
    const body = updateReportSettingsInput.parse(req.body);
    // Plain scalar fields — usable for both the create and update branches of the
    // singleton upsert (Prisma's *UpdateInput union types don't spread into create).
    const fields: {
      organizationName?: string;
      accentColor?: string;
      logoDataUri?: string | null;
      footerNote?: string | null;
    } = {};
    if (body.organizationName !== undefined) fields.organizationName = body.organizationName;
    if (body.accentColor !== undefined) fields.accentColor = body.accentColor;
    if (body.logoDataUri !== undefined) fields.logoDataUri = body.logoDataUri;
    // Empty footer clears to null (the renderer then uses its default line).
    if (body.footerNote !== undefined)
      fields.footerNote = body.footerNote === '' ? null : body.footerNote;

    const updated = await app.db.reportSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...fields },
      update: fields,
    });
    return serializeReportSettings(updated);
  });
}
