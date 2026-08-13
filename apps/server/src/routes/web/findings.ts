import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createFindingInput } from '@reporter/shared';
import { HttpError, requireAuth, requireOperationRole } from '../../auth/guards.js';
import {
  evidenceInclude,
  serializeEvidence,
  serializeFinding,
} from '../../services/serializers.js';

const findingInclude = {
  category: true,
  _count: { select: { evidence: true } },
} as const;

async function categoryIdFor(app: FastifyInstance, name: string | null): Promise<number | null> {
  if (!name) return null;
  const cat = await app.db.findingCategory.upsert({
    where: { category: name },
    create: { category: name },
    update: {},
  });
  return cat.id;
}

export async function findingRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/operations/:slug/findings',
    { preHandler: [requireAuth, requireOperationRole('read')] },
    async (req) => {
      const { slug } = req.params as { slug: string };
      const op = await app.db.operation.findUniqueOrThrow({ where: { slug } });
      const findings = await app.db.finding.findMany({
        where: { operationId: op.id },
        include: findingInclude,
        orderBy: { createdAt: 'desc' },
      });
      return findings.map((f) => serializeFinding(f, slug));
    },
  );

  app.post(
    '/operations/:slug/findings',
    { preHandler: [requireAuth, requireOperationRole('write')] },
    async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const input = createFindingInput.parse(req.body);
      const op = await app.db.operation.findUniqueOrThrow({ where: { slug } });
      const finding = await app.db.finding.create({
        data: {
          operationId: op.id,
          title: input.title,
          description: input.description,
          categoryId: await categoryIdFor(app, input.category),
        },
        include: findingInclude,
      });
      reply.status(201);
      return serializeFinding(finding, slug);
    },
  );

  app.get(
    '/operations/:slug/findings/:uuid',
    { preHandler: [requireAuth, requireOperationRole('read')] },
    async (req) => {
      const { slug, uuid } = req.params as { slug: string; uuid: string };
      const op = await app.db.operation.findUniqueOrThrow({ where: { slug } });
      const finding = await app.db.finding.findFirst({
        where: { uuid, operationId: op.id },
        include: findingInclude,
      });
      if (!finding) throw new HttpError(404, 'Finding not found');
      const links = await app.db.evidenceFinding.findMany({
        where: { findingId: finding.id },
        include: { evidence: { include: evidenceInclude } },
      });
      return {
        ...serializeFinding(finding, slug),
        evidence: links.map((l) => serializeEvidence(l.evidence, slug)),
      };
    },
  );

  app.put(
    '/operations/:slug/findings/:uuid',
    { preHandler: [requireAuth, requireOperationRole('write')] },
    async (req) => {
      const { slug, uuid } = req.params as { slug: string; uuid: string };
      const body = z
        .object({
          title: z.string().min(1).max(255).optional(),
          description: z.string().optional(),
          category: z.string().nullable().optional(),
          readyToReport: z.boolean().optional(),
          ticketLink: z.string().url().nullable().optional(),
        })
        .parse(req.body);
      const op = await app.db.operation.findUniqueOrThrow({ where: { slug } });
      const finding = await app.db.finding.findFirst({ where: { uuid, operationId: op.id } });
      if (!finding) throw new HttpError(404, 'Finding not found');

      const updated = await app.db.finding.update({
        where: { id: finding.id },
        data: {
          title: body.title ?? undefined,
          description: body.description ?? undefined,
          readyToReport: body.readyToReport ?? undefined,
          ticketLink: body.ticketLink === undefined ? undefined : body.ticketLink,
          categoryId:
            body.category === undefined ? undefined : await categoryIdFor(app, body.category),
        },
        include: findingInclude,
      });
      return serializeFinding(updated, slug);
    },
  );

  app.delete(
    '/operations/:slug/findings/:uuid',
    { preHandler: [requireAuth, requireOperationRole('write')] },
    async (req) => {
      const { slug, uuid } = req.params as { slug: string; uuid: string };
      const op = await app.db.operation.findUniqueOrThrow({ where: { slug } });
      const finding = await app.db.finding.findFirst({ where: { uuid, operationId: op.id } });
      if (!finding) throw new HttpError(404, 'Finding not found');
      await app.db.finding.delete({ where: { id: finding.id } });
      return { ok: true };
    },
  );

  // Attach/detach evidence to a finding.
  app.post(
    '/operations/:slug/findings/:uuid/evidence',
    { preHandler: [requireAuth, requireOperationRole('write')] },
    async (req) => {
      const { slug, uuid } = req.params as { slug: string; uuid: string };
      const { evidenceUuids } = z
        .object({ evidenceUuids: z.array(z.string().uuid()).min(1) })
        .parse(req.body);
      const op = await app.db.operation.findUniqueOrThrow({ where: { slug } });
      const finding = await app.db.finding.findFirst({ where: { uuid, operationId: op.id } });
      if (!finding) throw new HttpError(404, 'Finding not found');
      const evidence = await app.db.evidence.findMany({
        where: { uuid: { in: evidenceUuids }, operationId: op.id },
        select: { id: true },
      });
      await app.db.evidenceFinding.createMany({
        data: evidence.map((e) => ({ evidenceId: e.id, findingId: finding.id })),
        skipDuplicates: true,
      });
      return { ok: true, attached: evidence.length };
    },
  );

  app.delete(
    '/operations/:slug/findings/:uuid/evidence/:evidenceUuid',
    { preHandler: [requireAuth, requireOperationRole('write')] },
    async (req) => {
      const { slug, uuid, evidenceUuid } = req.params as {
        slug: string;
        uuid: string;
        evidenceUuid: string;
      };
      const op = await app.db.operation.findUniqueOrThrow({ where: { slug } });
      const finding = await app.db.finding.findFirst({ where: { uuid, operationId: op.id } });
      const evidence = await app.db.evidence.findFirst({
        where: { uuid: evidenceUuid, operationId: op.id },
      });
      if (!finding || !evidence) throw new HttpError(404, 'Not found');
      await app.db.evidenceFinding
        .delete({ where: { evidenceId_findingId: { evidenceId: evidence.id, findingId: finding.id } } })
        .catch(() => {});
      return { ok: true };
    },
  );
}
