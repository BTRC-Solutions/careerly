import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../platform/config/app-config.js';
import type { AiKeyCheck } from '../application/ai-key.ports.js';

const ANTHROPIC_VERSION = '2023-06-01';
const TIMEOUT_MS = 10_000;

/**
 * Verifies a key against Anthropic by listing one model: an authenticated call that uses no tokens.
 * 401/403 mean the key is rejected. 429 also proves the key authenticated, so it counts as valid.
 */
@Injectable()
export class AnthropicKeyVerifier {
  private readonly logger = new Logger(AnthropicKeyVerifier.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async check(apiKey: string): Promise<AiKeyCheck> {
    let status: number;
    try {
      const response = await fetch(`${this.config.aiBaseUrls.anthropic}/v1/models?limit=1`, {
        headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = response.status;
      await response.body?.cancel();
    } catch (error) {
      // Network failure or timeout. The error never contains the key (it only travels in a header).
      this.logger.warn(
        `Anthropic unreachable: ${error instanceof Error ? error.name : 'unknown error'}.`,
      );
      return 'UNREACHABLE';
    }

    if (status === 401 || status === 403) return 'INVALID';
    if ((status >= 200 && status < 300) || status === 429) return 'VALID';

    this.logger.warn(`Anthropic answered ${status} to the key check.`);
    return 'UNREACHABLE';
  }
}
