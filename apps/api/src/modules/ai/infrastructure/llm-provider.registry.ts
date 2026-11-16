import type { AiProvider } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { type LlmProvider, LlmProviderRegistry } from '../application/llm.ports.js';
import { GeminiLlmProvider } from './gemini-llm.provider.js';

/** Adapters available by provider (ADR-23). Claude's adapter is the next one to add here. */
@Injectable()
export class StaticLlmProviderRegistry extends LlmProviderRegistry {
  private readonly providers: Partial<Record<AiProvider, LlmProvider>>;

  constructor(gemini: GeminiLlmProvider) {
    super();
    this.providers = { gemini };
  }

  get(provider: AiProvider): LlmProvider | undefined {
    return this.providers[provider];
  }
}
