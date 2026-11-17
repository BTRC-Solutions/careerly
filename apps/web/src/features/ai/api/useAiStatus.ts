import { AiStatusSchema, AiUsageResponseSchema } from '@careerly/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../../shared/api/client';

export const AI_STATUS_QUERY_KEY = ['ai-status'] as const;
export const AI_USAGE_QUERY_KEY = ['ai-usage'] as const;

/** Whether a provider (or Claude Code) is configured and whether it rejected the key (RNF-13). */
export function useAiStatus() {
  return useQuery({
    queryKey: AI_STATUS_QUERY_KEY,
    queryFn: () => apiGet('/ai/status', AiStatusSchema),
  });
}

/** AI usage of a month ("2026-11"), with the 12 months up to it (RF-CONF-06). */
export function useAiUsage(month: string) {
  return useQuery({
    queryKey: [...AI_USAGE_QUERY_KEY, month],
    queryFn: () => apiGet(`/ai/usage?month=${month}`, AiUsageResponseSchema),
  });
}
