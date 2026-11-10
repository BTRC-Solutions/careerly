import {
  SettingsResponseSchema,
  type SettingsResponse,
  type UpdateSettingsRequest,
} from '@careerly/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '../../../shared/api/client';

export const SETTINGS_QUERY_KEY = ['settings'] as const;

export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => apiGet('/settings', SettingsResponseSchema),
    // Preferences only change through this app, so the cached copy stays valid.
    staleTime: Infinity,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateSettingsRequest) =>
      apiPatch('/settings', SettingsResponseSchema, patch),
    onSuccess: (settings: SettingsResponse) => {
      queryClient.setQueryData(SETTINGS_QUERY_KEY, settings);
    },
  });
}
