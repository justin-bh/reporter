import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import type { CreateEvidenceInput, Evidence, ParsedQuery } from '@reporter/shared';
import { buildEvidenceWhere } from '../helpers/timeline-filter.js';
import type { Pagination } from '../helpers/pagination.js';
import { evidenceInclude, serializeEvidence } from './serializers.js';

export interface CreateEvidenceArgs {
  operationId: number;
  operationSlug: string;
  operatorId: number;
  metadata: CreateEvidenceInput;
  file?: { data: Buffer; mimeType: string; filename: string };
}

const THUMB_MAX = 500;

/** Shared evidence-creation pipeline used by both the web and client APIs. */
export async function createEvidence(
  app: FastifyInstance,
  args: CreateEvidenceArgs,
): Promise<Evidence> {
  const { metadata, file } = args;

  let fullBlobKey: string | null = null;
  let thumbBlobKey: string | null = null;

  if (file) {
    fullBlobKey = randomUUID();
    await app.blobs.put(fullBlobKey, file.data);
    if (metadata.contentType === 'image') {
      try {
        const thumb = await sharp(file.data)
          .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        thumbBlobKey = randomUUID();
        await app.blobs.put(thumbBlobKey, thumb);
      } catch (err) {
        app.log.warn({ err }, 'thumbnail generation failed; storing without thumbnail');
      }
    }
  } else if (metadata.content !== undefined && metadata.content !== '') {
    // Inline text content (codeblock/event/note) is stored as a blob too, so all
    // evidence content is retrievable through one content endpoint.
    fullBlobKey = randomUUID();
    await app.blobs.put(fullBlobKey, Buffer.from(metadata.content, 'utf8'));
  }

  // Only attach tags that actually belong to this operation.
  const validTags =
    metadata.tagIds.length > 0
      ? await app.db.tag.findMany({
          where: { id: { in: metadata.tagIds }, operationId: args.operationId },
          select: { id: true },
        })
      : [];

  const occurredAt = metadata.occurredAt ? new Date(metadata.occurredAt) : new Date();

  const created = await app.db.evidence.create({
    data: {
      operationId: args.operationId,
      operatorId: args.operatorId,
      description: metadata.description ?? '',
      contentType: metadata.contentType,
      contentSubtype: metadata.contentSubtype ?? null,
      fullBlobKey,
      thumbBlobKey,
      occurredAt,
      tags: { create: validTags.map((t) => ({ tagId: t.id })) },
    },
    include: evidenceInclude,
  });

  return serializeEvidence(created, args.operationSlug);
}

export interface EvidenceListResult {
  items: Evidence[];
  total: number;
  page: number;
  pageSize: number;
}

/** List evidence for an operation, filtered by a parsed timeline query. */
export async function listEvidence(
  app: FastifyInstance,
  operationId: number,
  operationSlug: string,
  query: ParsedQuery,
  pagination: Pagination,
): Promise<EvidenceListResult> {
  const where = buildEvidenceWhere(query, operationId);
  const [rows, total] = await app.db.$transaction([
    app.db.evidence.findMany({
      where,
      include: evidenceInclude,
      orderBy: { occurredAt: query.sortAsc ? 'asc' : 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    }),
    app.db.evidence.count({ where }),
  ]);

  return {
    items: rows.map((r) => serializeEvidence(r, operationSlug)),
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
  };
}
