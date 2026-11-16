import { Injectable } from '@nestjs/common';
import { AiCredentialsStore } from '../../ai/index.js';
import { AiKeySource, type ProviderKey } from '../application/ai-key.ports.js';

/** Reads the active key from the `ai` module's in-memory store (filled by Electron's main process). */
@Injectable()
export class MemoryAiKeySource extends AiKeySource {
  constructor(private readonly store: AiCredentialsStore) {
    super();
  }

  current(): ProviderKey | null {
    return this.store.get();
  }
}
