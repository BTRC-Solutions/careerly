import { createHash, createPublicKey, verify } from 'node:crypto';

/**
 * Whether `signature` (base64) is the Ed25519 signature of the exact body bytes with `publicKey` (its 32 raw
 * bytes in base64url) (ADR-26). Anything malformed is simply not valid.
 */
export function isValidSignature(
  body: Buffer,
  signature: string | undefined,
  publicKey: string,
): boolean {
  if (!signature) return false;
  try {
    const key = createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: publicKey },
      format: 'jwk',
    });
    return verify(null, body, key, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

/** Leading zero bits of a hash. */
export function leadingZeroBits(hash: Buffer): number {
  let bits = 0;
  for (const byte of hash) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

/** Whether the SHA-256 of `challenge` starts with `difficulty` zero bits (hashcash). */
export function isValidProof(challenge: string, difficulty: number): boolean {
  return leadingZeroBits(createHash('sha256').update(challenge).digest()) >= difficulty;
}
