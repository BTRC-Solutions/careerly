import type { AiCredentials, AiProvider } from '@careerly/contracts';
import { Injectable, Logger } from '@nestjs/common';

type Credentials = NonNullable<AiCredentials['credentials']>;

/**
 * The AI API key in use, held only in memory (RNF-03). It arrives from the Electron main process
 * (`PUT /internal/ai-credentials`) and is never written to the database, files or logs.
 */
@Injectable()
export class AiCredentialsStore {
  private readonly logger = new Logger(AiCredentialsStore.name);
  private credentials: Credentials | null = null;

  /** Replaces the credentials. Logs only the provider, and only when something changed. */
  set(credentials: Credentials | null): void {
    const changed =
      credentials?.provider !== this.credentials?.provider ||
      credentials?.apiKey !== this.credentials?.apiKey;
    this.credentials = credentials ? { ...credentials } : null;
    if (changed) {
      this.logger.log(
        credentials
          ? `AI credentials updated (provider: ${credentials.provider}).`
          : 'AI credentials cleared.',
      );
    }
  }

  /** For the AI adapters only. Never return this from an HTTP route. */
  get(): Credentials | null {
    return this.credentials ? { ...this.credentials } : null;
  }

  activeProvider(): AiProvider | null {
    return this.credentials?.provider ?? null;
  }
}
