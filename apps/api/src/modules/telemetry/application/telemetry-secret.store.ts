import { Injectable } from '@nestjs/common';

/**
 * The secret the signing keys come from (ADR-26), received from Electron's main (`PUT
 * /internal/telemetry-secret`). Only in memory: never written to the database, the logs or a backup.
 */
@Injectable()
export class TelemetrySecretStore {
  private secret: Buffer | null = null;
  private readonly listeners: (() => void)[] = [];

  set(secret: string | null): void {
    this.secret = secret === null ? null : Buffer.from(secret, 'base64url');
    for (const listener of this.listeners) listener();
  }

  /** Getting the secret may unblock today's send. */
  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  get(): Buffer | null {
    return this.secret;
  }
}
