import type { VerifyAiKeyRequest, VerifyAiKeyResponse } from '@careerly/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { AiKeySource, AiKeyVerifier } from './ai-key.ports.js';

/** Verifies the AI API key (RF-CONF-02). The key is never stored or logged here (RNF-03). */
@Injectable()
export class AiKeyService {
  private readonly logger = new Logger(AiKeyService.name);

  constructor(
    private readonly source: AiKeySource,
    private readonly verifier: AiKeyVerifier,
  ) {}

  isConfigured(): boolean {
    return this.source.current() !== null;
  }

  /** Checks the candidate key from the request or, without one, the key held in memory. */
  async verify(request: VerifyAiKeyRequest): Promise<VerifyAiKeyResponse> {
    const apiKey = request.apiKey ?? this.source.current();
    if (apiKey === null) {
      return { status: 'NOT_CONFIGURED' };
    }

    const status = await this.verifier.check(apiKey);
    this.logger.log(
      `AI key verification: ${status} (${request.apiKey ? 'candidate' : 'stored'} key).`,
    );
    return { status };
  }
}
