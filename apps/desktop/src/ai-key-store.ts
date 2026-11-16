import fs from 'node:fs';
import path from 'node:path';
import {
  type AiKeysStatus,
  AiApiKeySchema,
  type AiProvider,
  AiProviderSchema,
} from '@careerly/contracts';
import { z } from 'zod';

/**
 * OS-backed encryption (Electron `safeStorage` in the app, a fake in tests).
 * `isAvailable()` is false when there is no real secure storage.
 */
export interface Encryptor {
  isAvailable(): boolean;
  encrypt(plainText: string): Buffer;
  decrypt(encrypted: Buffer): string;
}

export class SecureStorageUnavailableError extends Error {
  constructor() {
    super('This system offers no secure storage, so the API key cannot be saved safely.');
    this.name = 'SecureStorageUnavailableError';
  }
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: AiProvider) {
    super(`There is no API key saved for ${provider}.`);
    this.name = 'ProviderNotConfiguredError';
  }
}

/** Decrypted content of `secrets.bin`. Only ever held in main's memory. */
const SecretsSchema = z.object({
  version: z.literal(1),
  activeProvider: AiProviderSchema.nullable(),
  keys: z.partialRecord(AiProviderSchema, AiApiKeySchema),
});
type Secrets = z.infer<typeof SecretsSchema>;

const EMPTY: Secrets = { version: 1, activeProvider: null, keys: {} };

export interface ActiveCredentials {
  provider: AiProvider;
  apiKey: string;
}

/**
 * API keys per AI provider plus the active one (ADR-23, RF-CONF-01, RNF-03).
 * Stored as a single encrypted file; nothing is ever written in plain text.
 * If the OS offers no secure storage, saving is refused instead of storing the key unprotected.
 */
export class AiKeyStore {
  constructor(
    private readonly file: string,
    private readonly encryptor: Encryptor,
    /** Called without key contents (e.g. "secrets file could not be read"). */
    private readonly warn: (message: string) => void = () => {},
  ) {}

  status(): AiKeysStatus {
    const secrets = this.read();
    return {
      activeProvider: secrets.activeProvider,
      configured: Object.fromEntries(
        AiProviderSchema.options.map((provider) => [
          provider,
          secrets.keys[provider] !== undefined,
        ]),
      ) as AiKeysStatus['configured'],
      secureStorageAvailable: this.encryptor.isAvailable(),
    };
  }

  /** The key the backend must use, or `null` if none is configured. */
  activeCredentials(): ActiveCredentials | null {
    const { activeProvider, keys } = this.read();
    const apiKey = activeProvider ? keys[activeProvider] : undefined;
    return activeProvider && apiKey ? { provider: activeProvider, apiKey } : null;
  }

  /** Saves (or replaces) the key of a provider and makes that provider the active one. */
  save(provider: AiProvider, apiKey: string): AiKeysStatus {
    const key = AiApiKeySchema.parse(apiKey);
    const secrets = this.read();
    this.write({
      ...secrets,
      activeProvider: provider,
      keys: { ...secrets.keys, [provider]: key },
    });
    return this.status();
  }

  /** Removes a provider's key. If it was active, another configured provider (if any) becomes active. */
  remove(provider: AiProvider): AiKeysStatus {
    const secrets = this.read();
    const keys = { ...secrets.keys };
    delete keys[provider];
    const remaining = AiProviderSchema.options.filter((p) => keys[p] !== undefined);
    const activeProvider =
      secrets.activeProvider === provider ? (remaining[0] ?? null) : secrets.activeProvider;
    this.write({ ...secrets, keys, activeProvider });
    return this.status();
  }

  setActive(provider: AiProvider): AiKeysStatus {
    const secrets = this.read();
    if (secrets.keys[provider] === undefined) throw new ProviderNotConfiguredError(provider);
    this.write({ ...secrets, activeProvider: provider });
    return this.status();
  }

  private read(): Secrets {
    if (!fs.existsSync(this.file)) return EMPTY;
    if (!this.encryptor.isAvailable()) {
      this.warn('Secure storage is not available; saved API keys cannot be read.');
      return EMPTY;
    }
    try {
      const decrypted = this.encryptor.decrypt(fs.readFileSync(this.file));
      return SecretsSchema.parse(JSON.parse(decrypted));
    } catch {
      // E.g. the file was copied from another OS user or machine. Never log its content.
      this.warn('The saved API keys could not be read; they need to be entered again.');
      return EMPTY;
    }
  }

  private write(secrets: Secrets) {
    if (!this.encryptor.isAvailable()) throw new SecureStorageUnavailableError();
    const encrypted = this.encryptor.encrypt(JSON.stringify(secrets));
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    // Write then rename, so a crash never leaves a half-written file.
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, encrypted, { mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }
}
