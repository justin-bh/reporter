import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApiKey,
  CreateEvidenceInput,
  CreateFindingInput,
  CreateOperationInput,
  CreateTagInput,
  Evidence,
  Finding,
  Operation,
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

const opKey = (slug: string) => ['operation', slug];

// --- Operations ---
export const useOperations = () =>
  useQuery({ queryKey: ['operations'], queryFn: () => api.get<Operation[]>('/web/operations') });

export const useOperation = (slug: string) =>
  useQuery({ queryKey: opKey(slug), queryFn: () => api.get<Operation>(`/web/operations/${slug}`) });

export function useCreateOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOperationInput) => api.post<Operation>('/web/operations', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['operations'] }),
  });
}

export function useUpdateOperation(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Pick<Operation, 'name' | 'status'>>) =>
      api.put<Operation>(`/web/operations/${slug}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operations'] });
      qc.invalidateQueries({ queryKey: opKey(slug) });
    },
  });
}

export function useToggleFavorite(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (favorite: boolean) => api.post(`/web/operations/${slug}/favorite`, { favorite }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['operations'] }),
  });
}

// --- Evidence ---
export const useTimeline = (slug: string, q: string, page: number) =>
  useQuery({
    queryKey: ['timeline', slug, q, page],
    queryFn: () =>
      api.get<TimelineResult>(
        `/web/operations/${slug}/evidence?q=${encodeURIComponent(q)}&page=${page}`,
      ),
  });

export const useEvidence = (slug: string, uuid: string) =>
  useQuery({
    queryKey: ['evidence', slug, uuid],
    queryFn: () => api.get<Evidence>(`/web/operations/${slug}/evidence/${uuid}`),
  });

export function useCreateEvidence(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { metadata: CreateEvidenceInput; file?: File }) => {
      const form = new FormData();
      form.append('notes', JSON.stringify(args.metadata));
      if (args.file) form.append('file', args.file);
      return api.postForm<Evidence>(`/web/operations/${slug}/evidence`, form);
    },
    onSuccess: () => invalidateTimeline(qc, slug),
  });
}

export function useUpdateEvidence(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { uuid: string; patch: Record<string, unknown> }) =>
      api.put<Evidence>(`/web/operations/${slug}/evidence/${args.uuid}`, args.patch),
    onSuccess: (_d, v) => {
      invalidateTimeline(qc, slug);
      qc.invalidateQueries({ queryKey: ['evidence', slug, v.uuid] });
    },
  });
}

export function useDeleteEvidence(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uuid: string) => api.del(`/web/operations/${slug}/evidence/${uuid}`),
    onSuccess: () => invalidateTimeline(qc, slug),
  });
}

function invalidateTimeline(qc: ReturnType<typeof useQueryClient>, slug: string) {
  qc.invalidateQueries({ queryKey: ['timeline', slug] });
  qc.invalidateQueries({ queryKey: ['operations'] });
}

// --- Tags ---
export const useTags = (slug: string) =>
  useQuery({ queryKey: ['tags', slug], queryFn: () => api.get<Tag[]>(`/web/operations/${slug}/tags`) });

export function useCreateTag(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTagInput) => api.post<Tag>(`/web/operations/${slug}/tags`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags', slug] }),
  });
}

export function useUpdateTag(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; patch: Partial<Tag> }) =>
      api.put<Tag>(`/web/operations/${slug}/tags/${args.id}`, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags', slug] }),
  });
}

export function useDeleteTag(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/web/operations/${slug}/tags/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags', slug] }),
  });
}

// --- Findings ---
export const useFindings = (slug: string) =>
  useQuery({
    queryKey: ['findings', slug],
    queryFn: () => api.get<Finding[]>(`/web/operations/${slug}/findings`),
  });

export const useFinding = (slug: string, uuid: string) =>
  useQuery({
    queryKey: ['finding', slug, uuid],
    queryFn: () =>
      api.get<Finding & { evidence: Evidence[] }>(`/web/operations/${slug}/findings/${uuid}`),
  });

export function useCreateFinding(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFindingInput) =>
      api.post<Finding>(`/web/operations/${slug}/findings`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['findings', slug] }),
  });
}

export function useUpdateFinding(slug: string, uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api.put<Finding>(`/web/operations/${slug}/findings/${uuid}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['findings', slug] });
      qc.invalidateQueries({ queryKey: ['finding', slug, uuid] });
    },
  });
}

export function useDeleteFinding(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uuid: string) => api.del(`/web/operations/${slug}/findings/${uuid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['findings', slug] }),
  });
}

export function useAttachEvidence(slug: string, uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (evidenceUuids: string[]) =>
      api.post(`/web/operations/${slug}/findings/${uuid}/evidence`, { evidenceUuids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finding', slug, uuid] }),
  });
}

export function useDetachEvidence(slug: string, uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (evidenceUuid: string) =>
      api.del(`/web/operations/${slug}/findings/${uuid}/evidence/${evidenceUuid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finding', slug, uuid] }),
  });
}

// --- Saved queries ---
export const useSavedQueries = (slug: string) =>
  useQuery({
    queryKey: ['queries', slug],
    queryFn: () => api.get<SavedQuery[]>(`/web/operations/${slug}/queries`),
  });

export function useCreateSavedQuery(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; query: string; type: 'evidence' | 'findings' }) =>
      api.post<SavedQuery>(`/web/operations/${slug}/queries`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['queries', slug] }),
  });
}

export function useDeleteSavedQuery(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/web/operations/${slug}/queries/${id}`),
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
  useQuery({ queryKey: ['api-keys'], queryFn: () => api.get<AccountApiKey[]>('/web/account/api-keys') });

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
    mutationFn: (accessKey: string) => api.del(`/web/account/api-keys/${encodeURIComponent(accessKey)}`),
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
