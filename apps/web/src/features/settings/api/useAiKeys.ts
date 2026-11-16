import {
  type AiKeyStatus,
  type AiProvider,
  type VerifyAiKeyRequest,
  VerifyAiKeyResponseSchema,
} from '@careerly/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../../shared/api/client';
import { getDesktopActions } from '../../../shared/desktop';
import { AI_MODELS_QUERY_KEY } from './useAiModels';
import { SETTINGS_QUERY_KEY } from './useSettings';

/*
 * AI API keys (RF-CONF-01, RF-CONF-02, ADR-23). Keys are saved by Electron's main process
 * (encrypted, write-only from here) and verified by the backend. The key typed by the user only
 * lives in the form until it is saved; it is never put in a query key or in the cache.
 */

export const AI_KEYS_QUERY_KEY = ['ai-keys'] as const;

/** Which providers have a saved key (only available inside the desktop app). */
export function useAiKeysStatus() {
  const aiKeys = getDesktopActions().aiKeys;
  return useQuery({
    queryKey: AI_KEYS_QUERY_KEY,
    queryFn: () => aiKeys!.status(),
    enabled: aiKeys !== undefined,
  });
}

/** Test call to the provider: a candidate key (`{ provider, apiKey }`) or the active stored one (`{}`). */
export function useVerifyAiKey() {
  return useMutation({
    mutationFn: (request: VerifyAiKeyRequest) =>
      apiPost('/settings/ai-key/verify', VerifyAiKeyResponseSchema, request),
  });
}

/**
 * Refreshes both views of the key state, main's (saved keys) and the backend's (`GET /settings`),
 * and the models, which depend on the active key.
 */
function useRefreshKeyState() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: AI_KEYS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: AI_MODELS_QUERY_KEY }),
    ]);
}

export function useSaveAiKey() {
  const refresh = useRefreshKeyState();
  return useMutation({
    mutationFn: ({ provider, apiKey }: { provider: AiProvider; apiKey: string }) =>
      requireAiKeys().save(provider, apiKey),
    onSuccess: refresh,
  });
}

export function useRemoveAiKey() {
  const refresh = useRefreshKeyState();
  return useMutation({
    mutationFn: (provider: AiProvider) => requireAiKeys().remove(provider),
    onSuccess: refresh,
  });
}

export function useSetActiveAiProvider() {
  const refresh = useRefreshKeyState();
  return useMutation({
    mutationFn: (provider: AiProvider) => requireAiKeys().setActive(provider),
    onSuccess: refresh,
  });
}

function requireAiKeys() {
  const aiKeys = getDesktopActions().aiKeys;
  if (!aiKeys) throw new Error('API keys can only be managed from the desktop app.');
  return aiKeys;
}

/** What to do with a candidate key after verifying it. */
export type AfterVerification = 'save' | 'rejected' | 'confirmUnverified';

/**
 * A key the provider accepted is saved; a rejected one is not. If the provider could not be
 * reached (offline, outage), the key may be fine: the user decides whether to save it unverified.
 */
export function afterVerification(status: AiKeyStatus): AfterVerification {
  switch (status) {
    case 'VALID':
      return 'save';
    case 'INVALID':
      return 'rejected';
    case 'UNREACHABLE':
    case 'NOT_CONFIGURED':
      return 'confirmUnverified';
  }
}
