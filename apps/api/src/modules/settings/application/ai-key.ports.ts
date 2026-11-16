import type { AiProvider } from '@careerly/contracts';

/** Result of a test call to an AI provider with a given key. */
export type AiKeyCheck = 'VALID' | 'INVALID' | 'UNREACHABLE';

/** A provider and one of its API keys. */
export interface ProviderKey {
  provider: AiProvider;
  apiKey: string;
}

/**
 * Port: makes a cheap, authenticated test call to the key's provider (RF-CONF-02, ADR-23).
 * Declared as an abstract class so it can be used as a Nest DI token.
 */
export abstract class AiKeyVerifier {
  /** Never throws for provider or network errors: they map to `UNREACHABLE`. */
  abstract check(key: ProviderKey): Promise<AiKeyCheck>;
}

/** Port: the active provider and key the backend holds in memory (sent by Electron's main process). */
export abstract class AiKeySource {
  abstract current(): ProviderKey | null;
}
