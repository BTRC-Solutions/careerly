import {
  type AiModelOption,
  type AiModelsResponse,
  AiModelsResponseSchema,
  type ModelTier,
  type UpdateAiModelRequest,
} from '@careerly/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPut } from '../../../shared/api/client';

/*
 * AI model choice per tier (RF-CONF-09). The list comes from the provider (models the key can use)
 * plus the catalog in code; a model is tried with a minimal call before it is saved.
 */

export const AI_MODELS_QUERY_KEY = ['ai-models'] as const;

export function useAiModels() {
  return useQuery({
    queryKey: AI_MODELS_QUERY_KEY,
    queryFn: () => apiGet('/settings/ai-models', AiModelsResponseSchema),
    // Asking the provider for its models is a network call; they rarely change.
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Tries and saves a model for a tier, or goes back to the defaults (`model: null`). */
export function useChooseAiModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateAiModelRequest) =>
      apiPut('/settings/ai-models', AiModelsResponseSchema, request),
    onSuccess: (models: AiModelsResponse) => {
      queryClient.setQueryData(AI_MODELS_QUERY_KEY, models);
    },
  });
}

/**
 * Options for a tier: recommended for it first, then the other tested models, then the rest;
 * alphabetical inside each group. Unavailable models are only kept if chosen for this tier.
 */
export function modelOptionsFor(tier: ModelTier, models: AiModelsResponse): AiModelOption[] {
  const rank = (model: AiModelOption) =>
    model.recommendedFor.includes(tier) ? 0 : model.tested ? 1 : 2;
  return models.models
    .filter((model) => model.available || model.id === models.tiers[tier]?.selected)
    .sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}

/** Price per million tokens as "$0.30 / $2.50", or `null` when unknown. */
export function formatPrice(model: AiModelOption): string | null {
  if (model.inputUsdPerMTok === null || model.outputUsdPerMTok === null) return null;
  const usd = (value: number) => `$${value.toFixed(2)}`;
  return `${usd(model.inputUsdPerMTok)} / ${usd(model.outputUsdPerMTok)}`;
}
