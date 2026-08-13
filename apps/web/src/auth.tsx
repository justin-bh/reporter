import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from '@reporter/shared';
import { api, ApiError } from './api/client.js';

export interface ServerFlags {
  appName: string;
  needsSetup: boolean;
  oidcEnabled: boolean;
  webauthnEnabled: boolean;
}

interface AuthState {
  user: User | null;
  flags: ServerFlags | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const flagsQuery = useQuery({
    queryKey: ['flags'],
    queryFn: () => api.get<ServerFlags>('/web/flags'),
    staleTime: 60_000,
  });

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const res = await api.get<{ user: User }>('/web/me');
        return res.user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
  });

  const value: AuthState = {
    user: meQuery.data ?? null,
    flags: flagsQuery.data ?? null,
    loading: meQuery.isLoading || flagsQuery.isLoading,
    refresh: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      await qc.invalidateQueries({ queryKey: ['flags'] });
    },
    logout: async () => {
      await api.post('/web/logout');
      qc.clear();
      await qc.invalidateQueries({ queryKey: ['me'] });
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
