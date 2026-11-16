import { Injectable } from '@nestjs/common';
import { type AiKeyCheck, AiKeyVerifier, type ProviderKey } from '../application/ai-key.ports.js';
import { AnthropicKeyVerifier } from './anthropic-key-verifier.js';
import { GeminiKeyVerifier } from './gemini-key-verifier.js';

/** Sends each key to its own provider's check (ADR-23). */
@Injectable()
export class ProviderKeyVerifier extends AiKeyVerifier {
  constructor(
    private readonly gemini: GeminiKeyVerifier,
    private readonly anthropic: AnthropicKeyVerifier,
  ) {
    super();
  }

  check({ provider, apiKey }: ProviderKey): Promise<AiKeyCheck> {
    switch (provider) {
      case 'gemini':
        return this.gemini.check(apiKey);
      case 'anthropic':
        return this.anthropic.check(apiKey);
    }
  }
}
