import type { AiModelOption, AiModelsResponse, LlmProviderId } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { ActiveAiCredentials } from './active-ai-credentials.js';
import { AiModelChoiceStore } from './ai-model-choice.store.js';
import { AiNotConfiguredError, AiProviderNotSupportedError } from './llm-errors.js';
import { type LlmProvider, LlmProviderRegistry } from './llm.ports.js';
import type { ModelTier } from './llm.types.js';
import { AiSmokeTestService } from './smoke-test.service.js';

const TIERS: ModelTier[] = ['small', 'large'];

/**
 * Model choice (RF-CONF-09, ADR-23): which models the active key can use, what the catalog in code
 * knows about them and the current choice per tier. Saving the choice is up to the `settings`
 * module; this service only describes the options and tries a model before it is chosen.
 */
@Injectable()
export class AiModelsService {
  constructor(
    private readonly credentials: ActiveAiCredentials,
    private readonly providers: LlmProviderRegistry,
    private readonly choices: AiModelChoiceStore,
    private readonly smoke: AiSmokeTestService,
  ) {}

  /** The active provider; throws `AiNotConfiguredError` without a usable key. */
  async activeProvider(): Promise<LlmProviderId> {
    return (await this.active()).provider.id;
  }

  async overview(): Promise<AiModelsResponse> {
    const { provider, apiKey } = await this.active();
    const [listed, choice] = await Promise.all([
      provider.listModels(apiKey),
      this.choices.get(provider.id),
    ]);

    const ids = new Set(listed);
    const option = (id: string, available: boolean): AiModelOption => {
      const facts = provider.describeModel(id);
      return {
        id,
        available,
        inputUsdPerMTok: facts?.inputUsdPerMTok ?? null,
        outputUsdPerMTok: facts?.outputUsdPerMTok ?? null,
        recommendedFor: facts?.recommendedFor ?? [],
        tested: facts?.tested ?? false,
      };
    };
    const models = listed.map((id) => option(id, true));
    // A chosen model the provider no longer lists is shown as unavailable (calls fall back).
    for (const tier of TIERS) {
      const chosen = choice[tier];
      if (chosen && !ids.has(chosen)) {
        ids.add(chosen);
        models.push(option(chosen, false));
      }
    }

    return {
      provider: provider.id,
      tiers: {
        small: { selected: choice.small ?? null, defaults: provider.modelsFor('small') },
        large: { selected: choice.large ?? null, defaults: provider.modelsFor('large') },
      },
      models,
    };
  }

  /**
   * Tries `model` with one minimal structured call, without fallbacks. Throws the `AiError` of the
   * failure (rejected key, model not found, invalid structured output…).
   */
  async tryModel(model: string): Promise<void> {
    await this.smoke.probe(model);
  }

  private async active(): Promise<{ provider: LlmProvider; apiKey: string }> {
    const credentials = await this.credentials.get();
    if (!credentials) throw new AiNotConfiguredError();
    const provider = this.providers.get(credentials.provider);
    if (!provider) throw new AiProviderNotSupportedError(credentials.provider);
    return { provider, apiKey: credentials.apiKey };
  }
}
