import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import type { CreateEvidenceInput, Evidence, ParsedQuery } from '@reporter/shared';
import { buildEvidenceWhere } from '../helpers/timeline-filter.js';
import type { Pagination } from '../helpers/pagination.js';
import { evidenceInclude, serializeEvidence } from './serializers.js';

export interface CreateEvidenceArgs {
  engagementId: number;
  engagementSlug: string;
  operatorId: number;
  metadata: CreateEvidenceInput;
  file?: { data: Buffer; mimeType: string; filename: string };
  /** Preserve a specific uuid (used when importing evidence); defaults to a new one. */
  uuid?: string;
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
        // Cap decoded pixels (~40 MP, far above any legitimate screenshot) so a
        // decompression-bomb image can't exhaust memory during thumbnailing.
        const thumb = await sharp(file.data, { limitInputPixels: 40_000_000 })
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

  // Only attach tags that actually belong to this engagement.
  const validTags =
    metadata.tagIds.length > 0
      ? await app.db.tag.findMany({
          where: { id: { in: metadata.tagIds }, engagementId: args.engagementId },
          select: { id: true },
        })
      : [];

  const occurredAt = metadata.occurredAt ? new Date(metadata.occurredAt) : new Date();

  const created = await app.db.evidence.create({
    data: {
      uuid: args.uuid,
      engagementId: args.engagementId,
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

  return serializeEvidence(created, args.engagementSlug);
}

export interface EvidenceListResult {
  items: Evidence[];
  total: number;
  page: number;
  pageSize: number;
}

/** List evidence for an engagement, filtered by a parsed timeline query. */
export async function listEvidence(
  app: FastifyInstance,
  engagementId: number,
  engagementSlug: string,
  query: ParsedQuery,
  pagination: Pagination,
): Promise<EvidenceListResult> {
  const where = buildEvidenceWhere(query, engagementId);
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
    items: rows.map((r) => serializeEvidence(r, engagementSlug)),
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
  };
}
