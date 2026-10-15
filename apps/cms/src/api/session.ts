import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get } from './client';
import type { SessionInfo } from './types';

export const sessionKey = ['session'] as const;

/** Current session, or null when signed out. */
export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: async () => {
      try {
        return await get<SessionInfo>('/api/v1/auth/session');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 30_000,
  });
}

export function useRefreshSession() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: sessionKey });
}

export function useSetupStatus() {
  return useQuery({
    queryKey: ['setup-status'],
    queryFn: () =>
      get<{ needsSetup: boolean; setupTokenRequired: boolean }>('/api/v1/setup/status'),
    staleTime: 60_000,
  });
}
