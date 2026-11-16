import type { LlmProviderId } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { type LlmProvider, LlmProviderRegistry } from '../application/llm.ports.js';
import { AnthropicLlmProvider } from './anthropic-llm.provider.js';
import { ClaudeCodeLlmProvider } from './claude-code-llm.provider.js';
import { GeminiLlmProvider } from './gemini-llm.provider.js';

/** Adapters available by provider (ADR-23). */
@Injectable()
export class StaticLlmProviderRegistry extends LlmProviderRegistry {
  private readonly providers: Partial<Record<LlmProviderId, LlmProvider>>;

  constructor(
    gemini: GeminiLlmProvider,
    anthropic: AnthropicLlmProvider,
    claudeCode: ClaudeCodeLlmProvider,
  ) {
    super();
    this.providers = { gemini, anthropic, 'claude-code': claudeCode };
  }

  get(provider: LlmProviderId): LlmProvider | undefined {
    return this.providers[provider];
  }
}
