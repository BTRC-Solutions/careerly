import { createHmac, createPrivateKey, createPublicKey, type KeyObject, sign } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { type InstallationKey, TelemetryKeys } from '../application/telemetry.ports.js';
import { TelemetrySecretStore } from '../application/telemetry-secret.store.js';

/** PKCS#8 header of an Ed25519 private key; the 32-byte seed follows. */
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/**
 * Each installation's Ed25519 key is derived from the secret and its id (HMAC-SHA256 → seed), so a new id
 * brings a new key that cannot be linked to the old one, and nothing but the secret has to be kept (ADR-26).
 */
@Injectable()
export class HmacTelemetryKeys extends TelemetryKeys {
  private cached: { secret: Buffer; installId: string; key: InstallationKey } | null = null;

  constructor(private readonly secrets: TelemetrySecretStore) {
    super();
  }

  forInstallation(installId: string): InstallationKey | null {
    const secret = this.secrets.get();
    if (!secret) return null;
    if (this.cached?.secret === secret && this.cached.installId === installId)
      return this.cached.key;

    const seed = createHmac('sha256', secret).update(`careerly-telemetry:${installId}`).digest();
    const privateKey: KeyObject = createPrivateKey({
      key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
      format: 'der',
      type: 'pkcs8',
    });
    const { x } = createPublicKey(privateKey).export({ format: 'jwk' });
    const key: InstallationKey = {
      publicKey: x!,
      sign: (body) => sign(null, Buffer.from(body, 'utf8'), privateKey).toString('base64'),
    };
    this.cached = { secret, installId, key };
    return key;
  }
}
