/**
 * Errors of AI calls. Messages are for the user/developer and never include prompts, answers,
 * provider response bodies or the API key (RNF-02, RNF-03). `code` is stored in `AiGeneration`.
 */
export abstract class AiError extends Error {
  abstract readonly code: string;
}

/** No AI key configured (or not received from Electron yet): AI features are disabled (RNF-13). */
export class AiNotConfiguredError extends AiError {
  readonly code = 'NOT_CONFIGURED';
  constructor() {
    super('No AI API key is configured.');
    this.name = 'AiNotConfiguredError';
  }
}

/** The active provider has no adapter yet (ADR-23: Gemini first, Claude next). */
export class AiProviderNotSupportedError extends AiError {
  readonly code = 'PROVIDER_NOT_SUPPORTED';
  constructor(provider: string) {
    super(`The AI provider "${provider}" is not supported yet.`);
    this.name = 'AiProviderNotSupportedError';
  }
}

/** The provider rejected the key (wrong, revoked, restricted). */
export class AiKeyRejectedError extends AiError {
  readonly code = 'KEY_REJECTED';
  constructor() {
    super('The AI provider rejected the API key.');
    this.name = 'AiKeyRejectedError';
  }
}

/** Quota or rate limit reached. Retrying later may work. */
export class AiRateLimitedError extends AiError {
  readonly code = 'RATE_LIMITED';
  constructor() {
    super('The AI provider rate limit or quota was reached.');
    this.name = 'AiRateLimitedError';
  }
}

/** Offline, timeout or provider-side error. */
export class AiUnavailableError extends AiError {
  readonly code = 'UNAVAILABLE';
  constructor(detail: string) {
    super(`The AI provider is not available (${detail}).`);
    this.name = 'AiUnavailableError';
  }
}

/**
 * This model cannot be used right now (retired: 404, overloaded: 503), but another model of the
 * same provider may work: `LlmClient` moves on to the next model of the tier.
 */
export class AiModelUnavailableError extends AiError {
  readonly code = 'MODEL_UNAVAILABLE';
  constructor(model: string, reason: 'not found' | 'overloaded') {
    super(`The AI model ${model} is not available (${reason}).`);
    this.name = 'AiModelUnavailableError';
  }
}

/** The provider refused to answer (safety filters) or returned nothing. */
export class AiBlockedError extends AiError {
  readonly code = 'BLOCKED';
  constructor(reason: string) {
    super(`The AI provider did not return an answer (${reason}).`);
    this.name = 'AiBlockedError';
  }
}

/** The answer was not valid JSON for the expected schema, even after one retry. */
export class AiInvalidOutputError extends AiError {
  readonly code = 'INVALID_OUTPUT';
  constructor() {
    super('The AI answer did not have the expected structure.');
    this.name = 'AiInvalidOutputError';
  }
}
