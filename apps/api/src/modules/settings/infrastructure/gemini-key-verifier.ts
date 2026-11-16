import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../platform/config/app-config.js';
import type { AiKeyCheck } from '../application/ai-key.ports.js';

const TIMEOUT_MS = 10_000;

/** Reasons Google gives when the key itself is the problem (inside a 400 response). */
const INVALID_KEY_REASONS = ['API_KEY_INVALID', 'API_KEY_EXPIRED'];

/**
 * Verifies a key against the Gemini API by listing one model: authenticated, uses no tokens.
 *
 * Unlike other providers, Gemini answers **400** (`API_KEY_INVALID`) for a wrong key, not 401.
 * 401/403 (e.g. the key is restricted or the API is disabled for its project) also mean the key
 * cannot be used. 429 proves the key authenticated, so it counts as valid.
 */
@Injectable()
export class GeminiKeyVerifier {
  private readonly logger = new Logger(GeminiKeyVerifier.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async check(apiKey: string): Promise<AiKeyCheck> {
    let status: number;
    let body = '';
    try {
      // The key goes in a header, never in the URL (URLs end up in logs and error messages).
      const response = await fetch(`${this.config.aiBaseUrls.gemini}/v1beta/models?pageSize=1`, {
        headers: { 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = response.status;
      if (status === 400) {
        body = await response.text();
      } else {
        await response.body?.cancel();
      }
    } catch (error) {
      this.logger.warn(
        `Gemini unreachable: ${error instanceof Error ? error.name : 'unknown error'}.`,
      );
      return 'UNREACHABLE';
    }

    if (status === 401 || status === 403) return 'INVALID';
    if (status === 400 && INVALID_KEY_REASONS.some((reason) => body.includes(reason))) {
      return 'INVALID';
    }
    if ((status >= 200 && status < 300) || status === 429) return 'VALID';

    // Never log the response body: it may describe the request.
    this.logger.warn(`Gemini answered ${status} to the key check.`);
    return 'UNREACHABLE';
  }
}
