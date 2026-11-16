import type { LlmProviderId } from '@careerly/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { AiCredentialsStore } from './ai-credentials.store.js';

/** What AI calls use: a provider and its key (empty for Claude Code, which has no key). */
export interface ActiveCredentials {
  provider: LlmProviderId;
  apiKey: string;
}

/**
 * Which provider answers AI calls (ADR-23, ADR-25): Claude Code with the user's subscription when
 * it is turned on in Settings, otherwise the API key Electron sent. The `settings` module stores
 * the switch and plugs its reader in at startup (`useClaudeCodeSource`); reading it on every call
 * keeps it right after a change, a restore or a deletion of all data.
 */
@Injectable()
export class ActiveAiCredentials {
  private readonly logger = new Logger(ActiveAiCredentials.name);
  private claudeCodeEnabled: () => Promise<boolean> = () => Promise.resolve(false);

  constructor(private readonly keys: AiCredentialsStore) {}

  useClaudeCodeSource(source: () => Promise<boolean>): void {
    this.claudeCodeEnabled = source;
  }

  async get(): Promise<ActiveCredentials | null> {
    try {
      if (await this.claudeCodeEnabled()) return { provider: 'claude-code', apiKey: '' };
    } catch (error) {
      // The switch cannot be read: fall back to the API key, as if it were off.
      this.logger.error(
        `Could not read the Claude Code switch: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return this.keys.get();
  }
}
