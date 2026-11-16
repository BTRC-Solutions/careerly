import { Injectable } from '@nestjs/common';
import { AiKeyStore } from '../../../platform/secrets/ai-key-store.js';
import { AiKeySource } from '../application/ai-key.ports.js';

@Injectable()
export class MemoryAiKeySource extends AiKeySource {
  constructor(private readonly store: AiKeyStore) {
    super();
  }

  current(): string | null {
    return this.store.get();
  }
}
