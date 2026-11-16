import type { AiProvider } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import type { ModelTier } from './llm.types.js';

/** The user's model per tier for one provider; a missing tier uses the defaults (RF-CONF-09). */
export type ModelChoice = Partial<Record<ModelTier, string>>;

/**
 * Where `LlmClient` reads the user's model choice. The `settings` module stores it and plugs its
 * reader in at startup (`useSource`); reading on every call keeps it right after a change, a
 * restore or a deletion of all data. Until then there is no choice: the defaults are used.
 */
@Injectable()
export class AiModelChoiceStore {
  private source: (provider: AiProvider) => Promise<ModelChoice> = () => Promise.resolve({});

  useSource(source: (provider: AiProvider) => Promise<ModelChoice>): void {
    this.source = source;
  }

  get(provider: AiProvider): Promise<ModelChoice> {
    return this.source(provider);
  }
}
