/**
 * Holds the user's AI API key in memory only (RNF-03). Electron's main process decrypts it with
 * `safeStorage` and sends it over the utility-process channel; it never reaches the database,
 * logs or files.
 *
 * The key lives in a private field, so it is skipped by `JSON.stringify`, pino and `util.inspect`.
 */
export class AiKeyStore {
  #apiKey: string | null = null;

  /** Replaces the key; an empty value or `null` removes it. */
  set(apiKey: string | null): void {
    const trimmed = apiKey?.trim();
    this.#apiKey = trimmed ? trimmed : null;
  }

  get(): string | null {
    return this.#apiKey;
  }

  isConfigured(): boolean {
    return this.#apiKey !== null;
  }
}
