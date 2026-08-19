import type {
  ApiKey as DbApiKey,
  Evidence as DbEvidence,
  EvidenceFinding as DbEvidenceFinding,
  Finding as DbFinding,
  FindingCategory,
  Engagement as DbEngagement,
  ReportSettings as DbReportSettings,
  SavedQuery as DbSavedQuery,
  Tag as DbTag,
  User as DbUser,
} from '@prisma/client';
import type {
  ApiKey,
  Evidence,
  FindingEvidence,
  Finding,
  Engagement,
  EngagementRole,
  ReportSettings,
  SavedQuery,
  Tag,
  User,
} from '@reporter/shared';

export function serializeUser(u: DbUser, extras: { mustResetPassword?: boolean } = {}): User {
  return {
    slug: u.slug,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    admin: u.admin,
    disabled: u.disabled,
    headless: u.headless,
    // Only /web/me passes this — it lives on the local AuthIdentity, not the user.
    mustResetPassword: extras.mustResetPassword,
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
    clientName: eng.clientName,
    assessmentType: eng.assessmentType,
    location: eng.location,
    scope: eng.scope,
    executiveSummary: eng.executiveSummary,
    methodology: eng.methodology,
    watermarkEnabled: eng.watermarkEnabled,
    watermarkText: eng.watermarkText,
    watermarkColor: eng.watermarkColor,
    watermarkOpacity: eng.watermarkOpacity as Engagement['watermarkOpacity'],
    watermarkLayer: eng.watermarkLayer as Engagement['watermarkLayer'],
    role: extras.role,
    favorite: extras.favorite,
    numUsers: extras.numUsers,
    numEvidence: extras.numEvidence,
    numFindings: extras.numFindings,
  };
}

/** Public API-key shape. The secret is never included (it is returned exactly once, at creation). */
export function serializeApiKey(k: DbApiKey): ApiKey {
  return {
    accessKey: k.accessKey,
    lastAuth: k.lastAuth?.toISOString() ?? null,
    createdAt: k.createdAt.toISOString(),
  };
}

export function serializeTag(t: DbTag, usageCount?: number): Tag {
  return { id: t.id, name: t.name, colorName: t.colorName, usageCount };
}

export function serializeReportSettings(s: DbReportSettings): ReportSettings {
  return {
    organizationName: s.organizationName,
    accentColor: s.accentColor,
    logoDataUri: s.logoDataUri,
    footerNote: s.footerNote,
  };
}

type EvidenceWithRelations = DbEvidence & {
  operator: Pick<DbUser, 'slug' | 'firstName' | 'lastName'>;
  tags: { tag: DbTag }[];
  /** Present when the include resolves the comment parent; used for parentEvidenceUuid. */
  parent?: Pick<DbEvidence, 'uuid'> | null;
  /** Present when the include counts comments (linked evidence) on this item. */
  _count?: { comments: number };
  /** The requesting user's pref only (see `evidenceInclude`); powers `starred`. */
  userPrefs?: { isFavorite: boolean }[];
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
    starred: e.userPrefs?.[0]?.isFavorite ?? false,
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
    remediation: f.remediation,
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

/**
 * Standard include for returning a fully-populated evidence row, scoped to the
 * requesting user so `starred` reflects — and only ever exposes — their pref.
 */
export function evidenceInclude(userId: number) {
  return {
    operator: { select: { slug: true, firstName: true, lastName: true } },
    tags: { include: { tag: true } },
    // Comment-linking: the parent (for `parentEvidenceUuid`) and the count of
    // comments pointing at this item (for `commentCount`).
    parent: { select: { uuid: true } },
    _count: { select: { comments: true } },
    userPrefs: { where: { userId }, select: { isFavorite: true } },
  } as const;
}
