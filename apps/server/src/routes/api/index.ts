import type { FastifyInstance } from 'fastify';
import { createOperationInput, createTagInput } from '@reporter/shared';
import { HttpError, requireApiAuth, requireOperationRole } from '../../auth/guards.js';
import { createEvidence } from '../../services/evidence.js';
import { serializeOperation, serializeTag } from '../../services/serializers.js';
import { parseEvidenceRequest } from '../shared-evidence.js';
import { VERSION } from '../../version.js';

/**
 * Registers the client-API plane (`/api/*`). Every route is authenticated by
 * HMAC signature (see @reporter/api-client). Used by the desktop app and
 * terminal recorder.
 */
export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireApiAuth);

  app.get('/checkconnection', async (req) => {
    const u = req.authedUser!;
    return {
      ok: true as const,
      user: { slug: u.slug, firstName: u.firstName, lastName: u.lastName, email: u.email },
      serverVersion: VERSION,
    };
  });

  app.get('/operations', async (req) => {
    const user = req.authedUser!;
    const ops = await app.db.operation.findMany({
      where: user.admin ? {} : { roles: { some: { userId: user.id } } },
      include: {
        _count: { select: { evidence: true, roles: true } },
        roles: { where: { userId: user.id }, select: { role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return ops.map((op) =>
      serializeOperation(op, {
        role: user.admin ? 'admin' : op.roles[0]?.role,
        numUsers: op._count.roles,
        numEvidence: op._count.evidence,
      }),
    );
  });

  app.post('/operations', async (req) => {
    const input = createOperationInput.parse(req.body);
    const user = req.authedUser!;
    const existing = await app.db.operation.findUnique({ where: { slug: input.slug } });
    if (existing) throw new HttpError(409, 'An operation with that slug already exists');
    const defaultTags = await app.db.defaultTag.findMany();
    const op = await app.db.operation.create({
      data: {
        slug: input.slug,
        name: input.name,
        roles: { create: { userId: user.id, role: 'admin' } },
        tags: { create: defaultTags.map((t) => ({ name: t.name, colorName: t.colorName })) },
      },
    });
    return serializeOperation(op, { role: 'admin', numUsers: 1, numEvidence: 0 });
  });

  app.get(
    '/operations/:slug/tags',
    { preHandler: requireOperationRole('read') },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const op = await app.db.operation.findUniqueOrThrow({ where: { slug } });
      const tags = await app.db.tag.findMany({
        where: { operationId: op.id },
        orderBy: { name: 'asc' },
      });
      return tags.map(serializeTag);
    },
  );

  app.post(
    '/operations/:slug/tags',
    { preHandler: requireOperationRole('write') },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const input = createTagInput.parse(req.body);
      const op = await app.db.operation.findUniqueOrThrow({ where: { slug } });
      const existing = await app.db.tag.findUnique({
        where: { operationId_name: { operationId: op.id, name: input.name } },
      });
      if (existing) return serializeTag(existing);
      const tag = await app.db.tag.create({
        data: { operationId: op.id, name: input.name, colorName: input.colorName },
      });
      return serializeTag(tag);
    },
  );

  app.post(
    '/operations/:slug/evidence',
    { preHandler: requireOperationRole('write') },
    async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const op = await app.db.operation.findUniqueOrThrow({ where: { slug } });
      const { metadata, file } = await parseEvidenceRequest(req);
      const evidence = await createEvidence(app, {
        operationId: op.id,
        operationSlug: slug,
        operatorId: req.authedUser!.id,
        metadata,
        file,
      });
      reply.status(201);
      return evidence;
    },
  );
}
