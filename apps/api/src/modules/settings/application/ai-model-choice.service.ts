import {
  AiModelIdSchema,
  type AiModelsResponse,
  type LlmProviderId,
  type ModelTier,
  type UpdateAiModelRequest,
} from '@careerly/contracts';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AiModelCatalog, type StoredModelChoice } from './ai-models.ports.js';
import { SettingsService } from './settings.service.js';

/** Settings namespace of the choice: `ai.models.<provider>.<tier>` = model id. */
const NAMESPACE = 'ai';
const TIERS: ModelTier[] = ['small', 'large'];
const storageKey = (provider: LlmProviderId, tier: ModelTier) => `models.${provider}.${tier}`;

/**
 * AI models chosen by the user, per provider and tier (RF-CONF-09, ADR-23). A model is tried with a
 * minimal call before it is saved. AI calls read the choice on every call, so it applies at once
 * and follows a restore or a deletion of all data.
 */
@Injectable()
export class AiModelChoiceService implements OnModuleInit {
  constructor(
    private readonly settings: SettingsService,
    private readonly catalog: AiModelCatalog,
  ) {}

  onModuleInit() {
    this.catalog.useChoiceSource((provider) => this.read(provider));
  }

  overview(): Promise<AiModelsResponse> {
    return this.catalog.overview();
  }

  /** Tries and saves `model` for the tier, or goes back to the defaults with `null`. */
  async choose({ tier, model }: UpdateAiModelRequest): Promise<AiModelsResponse> {
    const provider = await this.catalog.activeProvider();
    if (model !== null) await this.catalog.tryModel(model);
    await this.settings.updateNamespace(NAMESPACE, {
      [storageKey(provider, tier)]: model ?? undefined,
    });
    return this.catalog.overview();
  }

  /** Stored values that are not a valid model id are ignored (the defaults apply). */
  private async read(provider: LlmProviderId): Promise<StoredModelChoice> {
    const stored = await this.settings.getNamespace(NAMESPACE);
    const choice: StoredModelChoice = {};
    for (const tier of TIERS) {
      const parsed = AiModelIdSchema.safeParse(stored.get(storageKey(provider, tier)));
      if (parsed.success) choice[tier] = parsed.data;
    }
    return choice;
  }
}
