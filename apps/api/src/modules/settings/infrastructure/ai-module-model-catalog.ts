import type { AiModelsResponse, AiProvider } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import {
  AiError,
  AiKeyRejectedError,
  AiModelChoiceStore,
  AiModelsService,
  AiModelUnavailableError,
  AiNotConfiguredError,
  AiProviderNotSupportedError,
  AiRateLimitedError,
  AiUnavailableError,
} from '../../ai/index.js';
import {
  AiModelCatalog,
  AiModelError,
  type AiModelFailure,
  type StoredModelChoice,
} from '../application/ai-models.ports.js';

/** Model choice through the `ai` module's public API, with its errors mapped to `AiModelError`. */
@Injectable()
export class AiModuleModelCatalog extends AiModelCatalog {
  constructor(
    private readonly models: AiModelsService,
    private readonly choices: AiModelChoiceStore,
  ) {
    super();
  }

  activeProvider(): AiProvider {
    try {
      return this.models.activeProvider();
    } catch (error) {
      throw toModelError(error);
    }
  }

  async overview(): Promise<AiModelsResponse> {
    try {
      return await this.models.overview();
    } catch (error) {
      throw toModelError(error);
    }
  }

  async tryModel(model: string): Promise<void> {
    try {
      await this.models.tryModel(model);
    } catch (error) {
      throw toModelError(error);
    }
  }

  useChoiceSource(source: (provider: AiProvider) => Promise<StoredModelChoice>): void {
    this.choices.useSource(source);
  }
}

function toModelError(error: unknown): unknown {
  if (!(error instanceof AiError)) return error;
  const reason: AiModelFailure =
    error instanceof AiNotConfiguredError || error instanceof AiProviderNotSupportedError
      ? 'AI_NOT_CONFIGURED'
      : error instanceof AiKeyRejectedError
        ? 'AI_KEY_REJECTED'
        : error instanceof AiRateLimitedError
          ? 'AI_RATE_LIMITED'
          : error instanceof AiModelUnavailableError
            ? 'AI_MODEL_UNAVAILABLE'
            : error instanceof AiUnavailableError
              ? 'AI_UNAVAILABLE'
              : 'AI_FAILED';
  return new AiModelError(reason, error.message);
}
