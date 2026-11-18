import type { AiCredentials, AiProvider } from '@careerly/contracts';
import { Injectable, Logger } from '@nestjs/common';

export type Credentials = NonNullable<AiCredentials['credentials']>;

/**
 * The active AI provider and its API key, held only in memory (RNF-03). They arrive from the
 * Electron main process (`PUT /internal/ai-credentials`, ADR-23) and are never written to the
 * database, files or logs.
 *
 * The credentials live in a private field, so `JSON.stringify`, pino and `util.inspect` skip them.
 */
@Injectable()
export class AiCredentialsStore {
  private readonly logger = new Logger(AiCredentialsStore.name);
  #credentials: Credentials | null = null;
  #changedAt = new Date().toISOString();
  #received = false;

  /** Replaces the credentials. Logs only the provider, and only when something changed. */
  set(credentials: Credentials | null): void {
    this.#received = true;
    const current = this.#credentials;
    const changed =
      credentials?.provider !== current?.provider || credentials?.apiKey !== current?.apiKey;
    this.#credentials = credentials
      ? { provider: credentials.provider, apiKey: credentials.apiKey }
      : null;
    if (changed) {
      this.#changedAt = new Date().toISOString();
      this.logger.log(
        credentials
          ? `AI credentials updated (provider: ${credentials.provider}).`
          : 'AI credentials cleared.',
      );
    }
  }

  /** For the AI adapters and the key check only. Never return this from an HTTP route. */
  get(): Credentials | null {
    return this.#credentials ? { ...this.#credentials } : null;
  }

  /** When the credentials last changed (or the backend started): older AI errors do not apply to them. */
  changedAt(): string {
    return this.#changedAt;
  }

  /**
   * Whether Electron has sent the credentials (even `null`, "no key") since the backend started. Until then a
   * missing key means "not known yet", not "not configured": jobs resumed at startup run before the first push.
   */
  received(): boolean {
    return this.#received;
  }

  activeProvider(): AiProvider | null {
    return this.#credentials?.provider ?? null;
  }
}
