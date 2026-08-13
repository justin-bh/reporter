import type {
  Evidence as DbEvidence,
  Finding as DbFinding,
  FindingCategory,
  Operation as DbOperation,
  SavedQuery as DbSavedQuery,
  Tag as DbTag,
  User as DbUser,
} from '@prisma/client';
import type {
  Evidence,
  Finding,
  Operation,
  OperationRole,
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

export function serializeOperation(
  op: DbOperation,
  extras: { role?: OperationRole; favorite?: boolean; numUsers?: number; numEvidence?: number } = {},
): Operation {
  return {
    slug: op.slug,
    name: op.name,
    status: op.status,
    createdAt: op.createdAt.toISOString(),
    role: extras.role,
    favorite: extras.favorite,
    numUsers: extras.numUsers,
    numEvidence: extras.numEvidence,
  };
}

export function serializeTag(t: DbTag): Tag {
  return { id: t.id, name: t.name, colorName: t.colorName };
}

type EvidenceWithRelations = DbEvidence & {
  operator: Pick<DbUser, 'slug' | 'firstName' | 'lastName'>;
  tags: { tag: DbTag }[];
};

export function serializeEvidence(e: EvidenceWithRelations, operationSlug: string): Evidence {
  return {
    uuid: e.uuid,
    operationSlug,
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
  };
}

type FindingWithRelations = DbFinding & {
  category: FindingCategory | null;
  _count?: { evidence: number };
};

export function serializeFinding(f: FindingWithRelations, operationSlug: string): Finding {
  return {
    uuid: f.uuid,
    operationSlug,
    title: f.title,
    description: f.description,
    category: f.category?.category ?? null,
    readyToReport: f.readyToReport,
    ticketLink: f.ticketLink,
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
} as const;
