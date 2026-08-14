import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApiKey,
  CreateEvidenceInput,
  CreateFindingInput,
  CreateEngagementInput,
  CreateTagInput,
  Evidence,
  Finding,
  FindingsImportResult,
  Engagement,
  SavedQuery,
  Tag,
  User,
} from '@reporter/shared';
import { api } from './client.js';

export interface TimelineResult {
  items: Evidence[];
  total: number;
  page: number;
  pageSize: number;
}

const engKey = (slug: string) => ['engagement', slug];

// --- Engagements ---
export const useEngagements = () =>
  useQuery({ queryKey: ['engagements'], queryFn: () => api.get<Engagement[]>('/web/engagements') });

export const useEngagement = (slug: string) =>
  useQuery({
    queryKey: engKey(slug),
    queryFn: () => api.get<Engagement>(`/web/engagements/${slug}`),
  });

export function useCreateEngagement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEngagementInput) => api.post<Engagement>('/web/engagements', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['engagements'] }),
  });
}

export function useUpdateEngagement(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Pick<Engagement, 'name' | 'status'>>) =>
      api.put<Engagement>(`/web/engagements/${slug}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['engagements'] });
      qc.invalidateQueries({ queryKey: engKey(slug) });
    },
  });
}

export function useToggleFavorite(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (favorite: boolean) => api.post(`/web/engagements/${slug}/favorite`, { favorite }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['engagements'] }),
  });
}

// --- Evidence ---
export const useTimeline = (slug: string, q: string, page: number) =>
  useQuery({
    queryKey: ['timeline', slug, q, page],
    queryFn: () =>
      api.get<TimelineResult>(
        `/web/engagements/${slug}/evidence?q=${encodeURIComponent(q)}&page=${page}`,
      ),
  });

export const useEvidence = (slug: string, uuid: string) =>
  useQuery({
    queryKey: ['evidence', slug, uuid],
    queryFn: () => api.get<Evidence>(`/web/engagements/${slug}/evidence/${uuid}`),
  });

/** An operator as it appears on evidence (for the timeline operator filter). */
export type EvidenceOperator = Evidence['operator'];

/** Distinct operators who have evidence in the engagement (read-level). */
export const useEvidenceOperators = (slug: string) =>
  useQuery({
    queryKey: ['evidence-operators', slug],
    queryFn: () => api.get<EvidenceOperator[]>(`/web/engagements/${slug}/evidence/operators`),
    staleTime: 5 * 60_000,
  });

export function useCreateEvidence(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { metadata: CreateEvidenceInput; file?: File }) => {
      const form = new FormData();
      form.append('notes', JSON.stringify(args.metadata));
      if (args.file) form.append('file', args.file);
      return api.postForm<Evidence>(`/web/engagements/${slug}/evidence`, form);
    },
    onSuccess: () => invalidateTimeline(qc, slug),
  });
}

export function useUpdateEvidence(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { uuid: string; patch: Record<string, unknown> }) =>
      api.put<Evidence>(`/web/engagements/${slug}/evidence/${args.uuid}`, args.patch),
    onSuccess: (_d, v) => {
      invalidateTimeline(qc, slug);
      qc.invalidateQueries({ queryKey: ['evidence', slug, v.uuid] });
    },
  });
}

export function useDeleteEvidence(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uuid: string) => api.del(`/web/engagements/${slug}/evidence/${uuid}`),
    onSuccess: () => invalidateTimeline(qc, slug),
  });
}

function invalidateTimeline(qc: ReturnType<typeof useQueryClient>, slug: string) {
  qc.invalidateQueries({ queryKey: ['timeline', slug] });
  qc.invalidateQueries({ queryKey: ['engagements'] });
}

// --- Tags ---
export const useTags = (slug: string) =>
  useQuery({
    queryKey: ['tags', slug],
    queryFn: () => api.get<Tag[]>(`/web/engagements/${slug}/tags`),
  });

export function useCreateTag(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTagInput) => api.post<Tag>(`/web/engagements/${slug}/tags`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags', slug] }),
  });
}

export function useUpdateTag(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; patch: Partial<Tag> }) =>
      api.put<Tag>(`/web/engagements/${slug}/tags/${args.id}`, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags', slug] }),
  });
}

export function useDeleteTag(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/web/engagements/${slug}/tags/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags', slug] }),
  });
}

// --- Findings ---
export const useFindings = (slug: string) =>
  useQuery({
    queryKey: ['findings', slug],
    queryFn: () => api.get<Finding[]>(`/web/engagements/${slug}/findings`),
  });

export const useFinding = (slug: string, uuid: string) =>
  useQuery({
    queryKey: ['finding', slug, uuid],
    queryFn: () =>
      api.get<Finding & { evidence: Evidence[] }>(`/web/engagements/${slug}/findings/${uuid}`),
  });

export function useCreateFinding(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFindingInput) =>
      api.post<Finding>(`/web/engagements/${slug}/findings`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['findings', slug] }),
  });
}

export function useUpdateFinding(slug: string, uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api.put<Finding>(`/web/engagements/${slug}/findings/${uuid}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['findings', slug] });
      qc.invalidateQueries({ queryKey: ['finding', slug, uuid] });
    },
  });
}

export function useDeleteFinding(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uuid: string) => api.del(`/web/engagements/${slug}/findings/${uuid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['findings', slug] }),
  });
}

/** Import a findings export (parsed JSON) into the engagement. */
export function useImportFindings(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) =>
      api.post<FindingsImportResult>(`/web/engagements/${slug}/findings/import`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['findings', slug] }),
  });
}

export function useAttachEvidence(slug: string, uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (evidenceUuids: string[]) =>
      api.post(`/web/engagements/${slug}/findings/${uuid}/evidence`, { evidenceUuids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finding', slug, uuid] }),
  });
}

export function useDetachEvidence(slug: string, uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (evidenceUuid: string) =>
      api.del(`/web/engagements/${slug}/findings/${uuid}/evidence/${evidenceUuid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finding', slug, uuid] }),
  });
}

/** Reorder findings by their full ordered UUID list (optimistic). */
export function useReorderFindings(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedUuids: string[]) =>
      api.patch(`/web/engagements/${slug}/findings/reorder`, { orderedUuids }),
    onMutate: async (orderedUuids) => {
      await qc.cancelQueries({ queryKey: ['findings', slug] });
      const prev = qc.getQueryData<Finding[]>(['findings', slug]);
      if (prev) {
        const byUuid = new Map(prev.map((f) => [f.uuid, f]));
        const next = orderedUuids.map((u) => byUuid.get(u)).filter((f): f is Finding => Boolean(f));
        qc.setQueryData(['findings', slug], next);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['findings', slug], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['findings', slug] }),
  });
}

type FindingWithEvidence = Finding & { evidence: Evidence[] };

/** Reorder the evidence attached to a finding (optimistic). */
export function useReorderEvidence(slug: string, uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedUuids: string[]) =>
      api.patch(`/web/engagements/${slug}/findings/${uuid}/evidence/reorder`, { orderedUuids }),
    onMutate: async (orderedUuids) => {
      await qc.cancelQueries({ queryKey: ['finding', slug, uuid] });
      const prev = qc.getQueryData<FindingWithEvidence>(['finding', slug, uuid]);
      if (prev) {
        const byUuid = new Map(prev.evidence.map((e) => [e.uuid, e]));
        const evidence = orderedUuids
          .map((u) => byUuid.get(u))
          .filter((e): e is Evidence => Boolean(e));
        qc.setQueryData(['finding', slug, uuid], { ...prev, evidence });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['finding', slug, uuid], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['finding', slug, uuid] }),
  });
}

// --- Saved queries ---
export const useSavedQueries = (slug: string) =>
  useQuery({
    queryKey: ['queries', slug],
    queryFn: () => api.get<SavedQuery[]>(`/web/engagements/${slug}/queries`),
  });

export function useCreateSavedQuery(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; query: string; type: 'evidence' | 'findings' }) =>
      api.post<SavedQuery>(`/web/engagements/${slug}/queries`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['queries', slug] }),
  });
}

export function useDeleteSavedQuery(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/web/engagements/${slug}/queries/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['queries', slug] }),
  });
}

// --- Account ---
export interface AccountApiKey {
  accessKey: string;
  lastAuth: string | null;
  createdAt: string;
}
export const useApiKeys = () =>
  useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.get<AccountApiKey[]>('/web/account/api-keys'),
  });

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ApiKey>('/web/account/api-keys'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accessKey: string) =>
      api.del(`/web/account/api-keys/${encodeURIComponent(accessKey)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}

// --- Admin ---
export const useUsers = () =>
  useQuery({ queryKey: ['admin-users'], queryFn: () => api.get<User[]>('/web/admin/users') });

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api.post<User>('/web/admin/users', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { slug: string; patch: Record<string, unknown> }) =>
      api.put<User>(`/web/admin/users/${args.slug}`, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}
