import type { AiStatus, AiUsageResponse } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { ActiveAiCredentials } from './active-ai-credentials.js';
import { AiCredentialsStore } from './ai-credentials.store.js';
import { summarizeUsage, usageReportStart } from './ai-usage.js';
import { KEY_REJECTED_CODE } from './llm-errors.js';
import { AiGenerationRepository, LlmProviderRegistry } from './llm.ports.js';

/** AI usage report (RF-CONF-06) and whether AI calls can be attempted (RNF-13). */
@Injectable()
export class AiUsageService {
  constructor(
    private readonly generations: AiGenerationRepository,
    private readonly credentials: ActiveAiCredentials,
    private readonly keys: AiCredentialsStore,
    private readonly providers: LlmProviderRegistry,
  ) {}

  async usage(month: string): Promise<AiUsageResponse> {
    const rows = await this.generations.listSince(usageReportStart(month).toISOString());
    return summarizeUsage(rows, month);
  }

  async status(): Promise<AiStatus> {
    const active = await this.credentials.get();
    if (!active || !this.providers.get(active.provider)) {
      return { configured: false, provider: null, keyRejected: false };
    }
    // Only errors since the key last changed count: a new key gets a fresh start.
    const lastError =
      active.provider === 'claude-code'
        ? null
        : await this.generations.latestErrorSince(active.provider, this.keys.changedAt());
    return {
      configured: true,
      provider: active.provider,
      keyRejected: lastError === KEY_REJECTED_CODE,
    };
  }
}
