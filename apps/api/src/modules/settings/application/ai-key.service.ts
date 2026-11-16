import type { AiProvider, VerifyAiKeyRequest, VerifyAiKeyResponse } from '@careerly/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { AiKeySource, AiKeyVerifier, type ProviderKey } from './ai-key.ports.js';

/** Verifies AI API keys (RF-CONF-02, ADR-23). Keys are never stored or logged here (RNF-03). */
@Injectable()
export class AiKeyService {
  private readonly logger = new Logger(AiKeyService.name);

  constructor(
    private readonly source: AiKeySource,
    private readonly verifier: AiKeyVerifier,
  ) {}

  /** Whether the backend holds a key, and for which provider. Never the key itself. */
  status(): { configured: boolean; provider: AiProvider | null } {
    const current = this.source.current();
    return { configured: current !== null, provider: current?.provider ?? null };
  }

  /** Checks the candidate key from the request or, without one, the active key held in memory. */
  async verify(request: VerifyAiKeyRequest): Promise<VerifyAiKeyResponse> {
    const key: ProviderKey | null =
      request.apiKey !== undefined && request.provider !== undefined
        ? { provider: request.provider, apiKey: request.apiKey }
        : this.source.current();
    if (key === null) {
      return { status: 'NOT_CONFIGURED', provider: null };
    }

    const status = await this.verifier.check(key);
    this.logger.log(
      `AI key verification: ${status} (${key.provider}, ${request.apiKey ? 'candidate' : 'stored'} key).`,
    );
    return { status, provider: key.provider };
  }
}
