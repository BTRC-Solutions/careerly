import type { AiGenerationStatus, AiProvider, AiTask } from '@careerly/contracts';
import type { ModelFacts, ModelTier, ProviderRequest, ProviderResponse } from './llm.types.js';

/**
 * Port: one AI provider (ADR-23). Adapters translate the request to the provider's API and map its
 * errors to `AiError`s. They never log prompts, answers or the key.
 */
export abstract class LlmProvider {
  abstract readonly id: AiProvider;
  /**
   * Default models for a tier, in order of preference (defaults in code, overridable by config).
   * Later ones are fallbacks when a model is retired or overloaded; the user's choice goes first.
   */
  abstract modelsFor(tier: ModelTier): string[];
  /** Estimated cost from the provider's price table; 0 if the model's price is unknown. */
  abstract estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number;
  /** Price, recommendation and testing from the catalog in code; `undefined` if unknown. */
  abstract describeModel(model: string): ModelFacts | undefined;
  abstract generateJson(request: ProviderRequest): Promise<ProviderResponse>;
  /** Text models this key can use for generation (RF-CONF-09). */
  abstract listModels(apiKey: string): Promise<string[]>;
}

/** Port: the adapters available, by provider. */
export abstract class LlmProviderRegistry {
  abstract get(provider: AiProvider): LlmProvider | undefined;
}

/** One attempt of an AI call, as stored in `AiGeneration` (no content, ever). */
export interface AiGenerationEntry {
  id: string;
  task: AiTask;
  provider: AiProvider;
  model: string;
  promptVersion: string;
  attempt: number;
  status: AiGenerationStatus;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  errorCode: string | null;
  createdAt: string;
}

/** Port: usage log of AI calls (RNF-06). */
export abstract class AiGenerationRepository {
  abstract record(entry: AiGenerationEntry): Promise<void>;
}
