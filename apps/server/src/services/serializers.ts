import type {
  Evidence as DbEvidence,
  EvidenceFinding as DbEvidenceFinding,
  Finding as DbFinding,
  FindingCategory,
  Engagement as DbEngagement,
  SavedQuery as DbSavedQuery,
  Tag as DbTag,
  User as DbUser,
} from '@prisma/client';
import type {
  Evidence,
  FindingEvidence,
  Finding,
  Engagement,
  EngagementRole,
  SavedQuery,
  Tag,
  User,
} from '@reporter/shared';

export function serializeUser(u: DbUser): User {
  return {
    slug: u.slug,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    admin: u.admin,
    disabled: u.disabled,
    headless: u.headless,
  };
}

export function serializeEngagement(
  eng: DbEngagement,
  extras: {
    role?: EngagementRole;
    favorite?: boolean;
    numUsers?: number;
    numEvidence?: number;
    numFindings?: number;
  } = {},
): Engagement {
  return {
    slug: eng.slug,
    name: eng.name,
    status: eng.status,
    createdAt: eng.createdAt.toISOString(),
    startedAt: eng.startedAt.toISOString(),
    projectedEndAt: eng.projectedEndAt?.toISOString() ?? null,
    actualEndAt: eng.actualEndAt?.toISOString() ?? null,
    role: extras.role,
    favorite: extras.favorite,
    numUsers: extras.numUsers,
    numEvidence: extras.numEvidence,
    numFindings: extras.numFindings,
  };
}

export function serializeTag(t: DbTag): Tag {
  return { id: t.id, name: t.name, colorName: t.colorName };
}

type EvidenceWithRelations = DbEvidence & {
  operator: Pick<DbUser, 'slug' | 'firstName' | 'lastName'>;
  tags: { tag: DbTag }[];
  /** Present when the include resolves the comment parent; used for parentEvidenceUuid. */
  parent?: Pick<DbEvidence, 'uuid'> | null;
  /** Present when the include counts comments (linked evidence) on this item. */
  _count?: { comments: number };
};

export function serializeEvidence(e: EvidenceWithRelations, engagementSlug: string): Evidence {
  return {
    uuid: e.uuid,
    engagementSlug,
    operator: {
      slug: e.operator.slug,
      firstName: e.operator.firstName,
      lastName: e.operator.lastName,
    },
    description: e.description,
    contentType: e.contentType as Evidence['contentType'],
    occurredAt: e.occurredAt.toISOString(),
    createdAt: e.createdAt.toISOString(),
    tags: e.tags.map((et) => serializeTag(et.tag)),
    hasContent: Boolean(e.fullBlobKey),
    hasThumbnail: Boolean(e.thumbBlobKey),
    parentEvidenceUuid: e.parent?.uuid ?? null,
    commentCount: e._count?.comments ?? 0,
  };
}

/**
 * Serialize an evidence↔finding link: the base evidence shape plus the link's
 * bucket fields (`caption`, `inPath`). Used to build a finding-detail response.
 */
export function serializeFindingEvidence(
  ef: DbEvidenceFinding & { evidence: EvidenceWithRelations },
  engagementSlug: string,
): FindingEvidence {
  return {
    ...serializeEvidence(ef.evidence, engagementSlug),
    caption: ef.caption,
    inPath: ef.inPath,
  };
}

type FindingWithRelations = DbFinding & {
  category: FindingCategory | null;
  _count?: { evidence: number };
};

export function serializeFinding(f: FindingWithRelations, engagementSlug: string): Finding {
  return {
    uuid: f.uuid,
    engagementSlug,
    title: f.title,
    description: f.description,
    category: f.category?.category ?? null,
    severity: f.severity,
    cvssVector: f.cvssVector,
    cvssScore: f.cvssScore,
    readyToReport: f.readyToReport,
    position: f.position,
    numEvidence: f._count?.evidence ?? 0,
    createdAt: f.createdAt.toISOString(),
  };
}

export function serializeSavedQuery(q: DbSavedQuery): SavedQuery {
  return { id: q.id, name: q.name, query: q.query, type: q.type };
}

/** Standard include for returning a fully-populated evidence row. */
export const evidenceInclude = {
  operator: { select: { slug: true, firstName: true, lastName: true } },
  tags: { include: { tag: true } },
  // Comment-linking: the parent (for `parentEvidenceUuid`) and the count of
  // comments pointing at this item (for `commentCount`).
  parent: { select: { uuid: true } },
  _count: { select: { comments: true } },
} as const;
