import { ClaudeCodeStatusSchema } from '@careerly/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPut } from '../../../shared/api/client';
import { AI_MODELS_QUERY_KEY } from './useAiModels';

/*
 * Claude Code with the user's subscription (RF-CONF-14, ADR-25): whether it is installed and
 * signed in on this computer, and the switch that sends AI calls to it instead of an API key.
 */

export const CLAUDE_CODE_QUERY_KEY = ['claude-code'] as const;

export function useClaudeCode() {
  return useQuery({
    queryKey: CLAUDE_CODE_QUERY_KEY,
    queryFn: () => apiGet('/settings/claude-code', ClaudeCodeStatusSchema),
    retry: false,
  });
}

/** Turning it on is refused (not saved) while Claude Code is not ready; the status says why. */
export function useSetClaudeCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      apiPut('/settings/claude-code', ClaudeCodeStatusSchema, { enabled }),
    onSuccess: (status) => {
      queryClient.setQueryData(CLAUDE_CODE_QUERY_KEY, status);
      // The active provider may have changed, and with it the models to choose from.
      void queryClient.invalidateQueries({ queryKey: AI_MODELS_QUERY_KEY });
    },
  });
}
