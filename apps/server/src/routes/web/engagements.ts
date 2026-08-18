import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  addEngagementMemberInput,
  createEngagementInput,
  engagementStatusSchema,
} from '@reporter/shared';
import { HttpError, requireAuth, requireEngagementRole } from '../../auth/guards.js';
import { serializeEngagement, serializeUser } from '../../services/serializers.js';

export async function engagementRoutes(app: FastifyInstance): Promise<void> {
  // List engagements visible to the current user (admins see all).
  app.get('/engagements', { preHandler: requireAuth }, async (req) => {
    const user = req.authedUser!;
    const engs = await app.db.engagement.findMany({
      where: user.admin ? {} : { roles: { some: { userId: user.id } } },
      include: {
        _count: { select: { evidence: true, roles: true, findings: true } },
        roles: { where: { userId: user.id }, select: { role: true } },
        prefs: { where: { userId: user.id }, select: { isFavorite: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return engs.map((eng) =>
      serializeEngagement(eng, {
        role: eng.roles[0]?.role,
        favorite: eng.prefs[0]?.isFavorite ?? false,
        numUsers: eng._count.roles,
        numEvidence: eng._count.evidence,
        numFindings: eng._count.findings,
      }),
    );
  });

  // Create an engagement; the creator becomes its admin and default tags are copied in.
  app.post('/engagements', { preHandler: requireAuth }, async (req) => {
    const input = createEngagementInput.parse(req.body);
    const user = req.authedUser!;

    const existing = await app.db.engagement.findUnique({ where: { slug: input.slug } });
    if (existing) throw new HttpError(409, 'An engagement with that slug already exists');

    const defaultTags = await app.db.defaultTag.findMany();

    const eng = await app.db.engagement.create({
      data: {
        slug: input.slug,
        name: input.name,
        roles: { create: { userId: user.id, role: 'admin' } },
        tags: { create: defaultTags.map((t) => ({ name: t.name, colorName: t.colorName })) },
      },
    });
    return serializeEngagement(eng, {
      role: 'admin',
      favorite: false,
      numUsers: 1,
      numEvidence: 0,
      numFindings: 0,
    });
  });

  app.get(
    '/engagements/:slug',
    { preHandler: [requireAuth, requireEngagementRole('read')] },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const eng = await app.db.engagement.findUniqueOrThrow({
        where: { slug },
        include: {
          _count: { select: { evidence: true, roles: true, findings: true } },
          roles: { where: { userId: req.authedUser!.id }, select: { role: true } },
          prefs: { where: { userId: req.authedUser!.id }, select: { isFavorite: true } },
        },
      });
      return serializeEngagement(eng, {
        role: req.authedUser!.admin ? 'admin' : eng.roles[0]?.role,
        favorite: eng.prefs[0]?.isFavorite ?? false,
        numUsers: eng._count.roles,
        numEvidence: eng._count.evidence,
        numFindings: eng._count.findings,
      });
    },
  );

  app.put(
    '/engagements/:slug',
    { preHandler: [requireAuth, requireEngagementRole('admin')] },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const body = z
        .object({
          name: z.string().min(1).max(255).optional(),
          status: engagementStatusSchema.optional(),
        })
        .parse(req.body);
      const eng = await app.db.engagement.update({ where: { slug }, data: body });
      return serializeEngagement(eng);
    },
  );

  // Delete an engagement and everything under it. Child rows (roles, prefs, tags,
  // evidence, findings, saved queries and their links) cascade at the DB level;
  // evidence blobs live outside the DB, so gather their keys first and reclaim
  // them from the blob store once the rows are gone.
  app.delete(
    '/engagements/:slug',
    { preHandler: [requireAuth, requireEngagementRole('admin')] },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });

      const evidence = await app.db.evidence.findMany({
        where: { engagementId: eng.id },
        select: { fullBlobKey: true, thumbBlobKey: true },
      });

      await app.db.engagement.delete({ where: { id: eng.id } });

      for (const ev of evidence) {
        for (const key of [ev.fullBlobKey, ev.thumbBlobKey]) {
          if (key) await app.blobs.delete(key).catch(() => {});
        }
      }
      return { ok: true };
    },
  );

  // Toggle favorite for the current user.
  app.post(
    '/engagements/:slug/favorite',
    { preHandler: [requireAuth, requireEngagementRole('read')] },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const { favorite } = z.object({ favorite: z.boolean() }).parse(req.body);
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      await app.db.userEngagementPref.upsert({
        where: { userId_engagementId: { userId: req.authedUser!.id, engagementId: eng.id } },
        create: { userId: req.authedUser!.id, engagementId: eng.id, isFavorite: favorite },
        update: { isFavorite: favorite },
      });
      return { favorite };
    },
  );

  // --- Engagement membership management (engagement admins) ---

  app.get(
    '/engagements/:slug/users',
    { preHandler: [requireAuth, requireEngagementRole('admin')] },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const roles = await app.db.userEngagementRole.findMany({
        where: { engagementId: eng.id },
        include: { user: true },
      });
      return roles.map((r) => ({ user: serializeUser(r.user), role: r.role }));
    },
  );

  app.post(
    '/engagements/:slug/users',
    { preHandler: [requireAuth, requireEngagementRole('admin')] },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const body = addEngagementMemberInput.parse(req.body);
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      // Emails are unique but may be stored mixed-case; match case-insensitively.
      const target = await app.db.user.findFirst({
        where: { email: { equals: body.email, mode: 'insensitive' } },
      });
      if (!target) throw new HttpError(404, `No user found with the email “${body.email}”`);
      await app.db.userEngagementRole.upsert({
        where: { userId_engagementId: { userId: target.id, engagementId: eng.id } },
        create: { userId: target.id, engagementId: eng.id, role: body.role },
        update: { role: body.role },
      });
      return { user: serializeUser(target), role: body.role };
    },
  );

  app.delete(
    '/engagements/:slug/users/:userSlug',
    { preHandler: [requireAuth, requireEngagementRole('admin')] },
    async (req) => {
      const { slug, userSlug } = req.params as { slug: string; userSlug: string };
      const eng = await app.db.engagement.findUniqueOrThrow({ where: { slug } });
      const target = await app.db.user.findUnique({ where: { slug: userSlug } });
      if (!target) throw new HttpError(404, 'User not found');
      await app.db.userEngagementRole
        .delete({ where: { userId_engagementId: { userId: target.id, engagementId: eng.id } } })
        .catch(() => {});
      return { ok: true };
    },
  );
}
