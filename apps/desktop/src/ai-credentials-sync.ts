import type { AiCredentials } from '@careerly/contracts';
import type { ActiveCredentials } from './ai-key-store.js';

export interface CredentialsSyncOptions {
  apiBaseUrl: string;
  /** Only main and the API know it; the interface token is not accepted by `/internal/*`. */
  controlToken: string;
  /** Reads the key to send (decrypted on demand, never cached here). */
  activeCredentials: () => ActiveCredentials | null;
  fetch?: typeof fetch;
}

/**
 * Sends the active AI API key from main to the backend's memory (ADR-23, RNF-03).
 * The key only travels over loopback, authenticated with the control token.
 */
export class AiCredentialsSync {
  private readonly fetch: typeof fetch;
  private keepAlive: NodeJS.Timeout | undefined;

  constructor(private readonly options: CredentialsSyncOptions) {
    this.fetch = options.fetch ?? fetch;
  }

  /** Sends the current credentials (or `null`) once. Throws if the backend rejects them. */
  async push(): Promise<void> {
    const body: AiCredentials = { credentials: this.options.activeCredentials() };
    const response = await this.fetch(`${this.options.apiBaseUrl}/internal/ai-credentials`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.options.controlToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      // The status is enough to diagnose; the response body is not logged on purpose.
      throw new Error(`The local service rejected the AI credentials (HTTP ${response.status}).`);
    }
  }

  /** Retries until the backend accepts them (in development the API may start after Electron). */
  async pushWhenReady({ attempts = 40, delayMs = 500 } = {}): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.push();
        return;
      } catch (error) {
        if (attempt >= attempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  /**
   * Development only: the API in watch mode restarts on every rebuild and forgets what it had in
   * memory, so the key is sent again every few seconds. Errors are ignored (the API may be restarting).
   */
  startKeepAlive(intervalMs = 5_000): void {
    this.stopKeepAlive();
    this.keepAlive = setInterval(() => void this.push().catch(() => {}), intervalMs);
    this.keepAlive.unref();
  }

  stopKeepAlive(): void {
    clearInterval(this.keepAlive);
    this.keepAlive = undefined;
  }
}
