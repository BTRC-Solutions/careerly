import type { AiProvider, ModelTier } from '@careerly/contracts';

/** A piece of input for the model: text, or a document the provider reads natively (e.g. a PDF CV). */
export type LlmPart =
  { type: 'text'; text: string } | { type: 'document'; mimeType: 'application/pdf'; data: Buffer };

/** One turn of the conversation sent to the provider. */
export interface LlmTurn {
  role: 'user' | 'model';
  parts: LlmPart[];
}

/** Small or large model (ARCHITECTURE §7.3). Each provider maps tiers to concrete models. */
export type { ModelTier };

/** What is known about a model from the provider's catalog in code (RF-CONF-09). */
export interface ModelFacts {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
  recommendedFor: ModelTier[];
  /** Tried with Careerly's structured output. */
  tested: boolean;
}

/**
 * A versioned prompt (prompts live as files in `ai/prompts/*.vN.ts`). The id is stored in
 * `AiGeneration.promptVersion`, so a change in behavior can be traced to a prompt version.
 */
export interface PromptVersion {
  /** e.g. `cv-import.v1`. */
  id: string;
  system: string;
}

/** What a provider adapter is asked to do: one call that must answer with JSON. */
export interface ProviderRequest {
  apiKey: string;
  model: string;
  system: string;
  turns: LlmTurn[];
  /** JSON Schema of the expected answer (from the Zod schema). */
  jsonSchema: Record<string, unknown>;
  timeoutMs: number;
}

export interface ProviderResponse {
  /** Raw text of the answer; the caller parses and validates it. */
  text: string;
  inputTokens: number;
  /** Includes "thinking" tokens when the provider bills them as output. */
  outputTokens: number;
}

/** Usage of a successful structured call, summed over its attempts. */
export interface LlmUsage {
  provider: AiProvider;
  model: string;
  attempts: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}
