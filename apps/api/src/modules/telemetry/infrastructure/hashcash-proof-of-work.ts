import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ProofOfWork } from '../application/telemetry.ports.js';

/** Hashes tried before yielding to the event loop, so the API keeps answering meanwhile. */
const BATCH = 4_096;

/** Hashcash for a new installation's first request (ADR-26): about a second at the receiver's 20 bits. */
@Injectable()
export class HashcashProofOfWork extends ProofOfWork {
  async solve(challenge: (nonce: string) => string, difficulty: number): Promise<string> {
    for (let nonce = 0; ; nonce++) {
      const candidate = nonce.toString(36);
      if (
        leadingZeroBits(createHash('sha256').update(challenge(candidate)).digest()) >= difficulty
      ) {
        return candidate;
      }
      if (nonce % BATCH === BATCH - 1) await new Promise((resolve) => setImmediate(resolve));
    }
  }
}

function leadingZeroBits(hash: Buffer): number {
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
