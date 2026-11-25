import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { TelemetrySecret } from '@careerly/contracts';
import type { Encryptor } from './ai-key-store.js';

const SECRET_FORMAT = /^[A-Za-z0-9_-]{43}$/;

/**
 * The secret the telemetry signing keys are derived from (ADR-26): 32 random bytes per computer, encrypted with
 * `safeStorage` in `telemetry-secret.bin`. It never goes to the database, the logs or a backup, so another
 * computer or a restored backup ends up with a new installation id instead of reusing one with another key.
 */
export class TelemetrySecretFile {
  constructor(
    private readonly file: string,
    private readonly encryptor: Encryptor,
    /** Called without the secret's content. */
    private readonly warn: (message: string) => void = () => {},
  ) {}

  /** The secret, created the first time; `null` without secure storage (then nothing is ever sent). */
  load(): string | null {
    if (!this.encryptor.isAvailable()) return null;
    if (fs.existsSync(this.file)) {
      try {
        const secret = this.encryptor.decrypt(fs.readFileSync(this.file));
        if (SECRET_FORMAT.test(secret)) return secret;
      } catch {
        // Encrypted by another OS user or Electron context: a new secret means a new installation.
      }
      this.warn('The telemetry secret could not be read; a new one replaces it.');
    }
    const secret = randomBytes(32).toString('base64url');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    // Write then rename, so a crash never leaves a half-written file.
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, this.encryptor.encrypt(secret), { mode: 0o600 });
    fs.renameSync(temporary, this.file);
    return secret;
  }
}

/**
 * Hands the secret to the backend's memory over loopback, with the control token. Retries while the backend
 * starts (in development it may come up after Electron).
 */
export async function pushTelemetrySecret(options: {
  apiBaseUrl: string;
  controlToken: string;
  secret: string | null;
  fetch?: typeof fetch;
  attempts?: number;
  delayMs?: number;
}): Promise<void> {
  const { attempts = 40, delayMs = 500 } = options;
  const body: TelemetrySecret = { secret: options.secret };
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await (options.fetch ?? fetch)(
        `${options.apiBaseUrl}/internal/telemetry-secret`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${options.controlToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );
      if (response.ok) return;
      throw new Error(`The local service rejected the telemetry secret (HTTP ${response.status}).`);
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
