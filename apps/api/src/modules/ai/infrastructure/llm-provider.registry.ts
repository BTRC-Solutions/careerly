import type { AiProvider } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { type LlmProvider, LlmProviderRegistry } from '../application/llm.ports.js';
import { AnthropicLlmProvider } from './anthropic-llm.provider.js';
import { GeminiLlmProvider } from './gemini-llm.provider.js';

/** Adapters available by provider (ADR-23). */
@Injectable()
export class StaticLlmProviderRegistry extends LlmProviderRegistry {
  private readonly providers: Partial<Record<AiProvider, LlmProvider>>;

  constructor(gemini: GeminiLlmProvider, anthropic: AnthropicLlmProvider) {
    super();
    this.providers = { gemini, anthropic };
  }

  get(provider: AiProvider): LlmProvider | undefined {
    return this.providers[provider];
  }
}
