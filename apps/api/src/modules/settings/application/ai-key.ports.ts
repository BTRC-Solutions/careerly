/** Result of a test call to the AI provider with a given key. */
export type AiKeyCheck = 'VALID' | 'INVALID' | 'UNREACHABLE';

/**
 * Port: makes a cheap, authenticated test call to the AI provider (RF-CONF-02).
 * Declared as an abstract class so it can be used as a Nest DI token.
 */
export abstract class AiKeyVerifier {
  /** Never throws for provider or network errors: they map to `UNREACHABLE`. */
  abstract check(apiKey: string): Promise<AiKeyCheck>;
}

/** Port: the key the backend currently holds in memory (sent by Electron's main process). */
export abstract class AiKeySource {
  abstract current(): string | null;
}
