import type { AiModelsResponse, AiProvider, ModelTier } from '@careerly/contracts';

/** Why listing or trying models failed, as reported to the interface (it is the API error code). */
export type AiModelFailure =
  | 'AI_NOT_CONFIGURED'
  | 'AI_KEY_REJECTED'
  | 'AI_RATE_LIMITED'
  | 'AI_UNAVAILABLE'
  | 'AI_MODEL_UNAVAILABLE'
  | 'AI_FAILED';

export class AiModelError extends Error {
  constructor(
    readonly reason: AiModelFailure,
    message: string,
  ) {
    super(message);
    this.name = 'AiModelError';
  }
}

/** The user's model per tier for one provider. */
export type StoredModelChoice = Partial<Record<ModelTier, string>>;

/**
 * Port: the `ai` module's side of the model choice (RF-CONF-09). Failures are `AiModelError`s.
 * Declared as an abstract class so it can be used as a Nest DI token.
 */
export abstract class AiModelCatalog {
  abstract activeProvider(): AiProvider;
  abstract overview(): Promise<AiModelsResponse>;
  /** One minimal call with `model` only; resolves if it answered with valid structured output. */
  abstract tryModel(model: string): Promise<void>;
  /** Where AI calls read the choice from (plugged in once, at startup). */
  abstract useChoiceSource(source: (provider: AiProvider) => Promise<StoredModelChoice>): void;
}
