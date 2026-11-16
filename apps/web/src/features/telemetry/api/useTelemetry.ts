import {
  RegenerateInstallIdResponseSchema,
  TelemetryPreviewResponseSchema,
  TelemetryReportsResponseSchema,
  TelemetrySettingsResponseSchema,
  type TelemetrySettingsResponse,
  type UpdateTelemetrySettingsRequest,
} from '@careerly/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from '../../../shared/api/client';

/* Telemetry consent and local history (RF-TEL-01 to RF-TEL-07). Nothing here sends data anywhere. */

export const TELEMETRY_SETTINGS_QUERY_KEY = ['telemetry', 'settings'] as const;
const PREVIEW_QUERY_KEY = ['telemetry', 'preview'] as const;
const REPORTS_QUERY_KEY = ['telemetry', 'reports'] as const;

export function useTelemetrySettings() {
  return useQuery({
    queryKey: TELEMETRY_SETTINGS_QUERY_KEY,
    queryFn: () => apiGet('/telemetry/settings', TelemetrySettingsResponseSchema),
  });
}

/** Answers the consent window or toggles metrics; refreshes the preview and history afterwards. */
export function useUpdateTelemetrySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateTelemetrySettingsRequest) =>
      apiPatch('/telemetry/settings', TelemetrySettingsResponseSchema, request),
    onSuccess: async (settings: TelemetrySettingsResponse) => {
      queryClient.setQueryData(TELEMETRY_SETTINGS_QUERY_KEY, settings);
      await queryClient.invalidateQueries({ queryKey: ['telemetry'] });
    },
  });
}

export function useTelemetryPreview(enabled: boolean) {
  return useQuery({
    queryKey: PREVIEW_QUERY_KEY,
    queryFn: () => apiGet('/telemetry/preview', TelemetryPreviewResponseSchema),
    enabled,
  });
}

export function useTelemetryReports(enabled: boolean) {
  return useQuery({
    queryKey: REPORTS_QUERY_KEY,
    queryFn: () => apiGet('/telemetry/reports', TelemetryReportsResponseSchema),
    enabled,
  });
}

export function useRegenerateInstallId() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost('/telemetry/install-id/regenerate', RegenerateInstallIdResponseSchema, undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['telemetry'] }),
  });
}
