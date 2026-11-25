import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Encryptor } from './ai-key-store.js';
import { pushTelemetrySecret, TelemetrySecretFile } from './telemetry-secret.js';

/** Reversible but not plain text, so the tests can prove the secret is never stored as is. */
function fakeEncryptor(available = true): Encryptor {
  return {
    isAvailable: () => available,
    encrypt: (text) => Buffer.from(text.split('').reverse().join(''), 'utf8'),
    decrypt: (buffer) => buffer.toString('utf8').split('').reverse().join(''),
  };
}

describe('TelemetrySecretFile', () => {
  let dir: string;
  let file: string;
  let warnings: string[];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'careerly-telemetry-'));
    file = path.join(dir, 'telemetry-secret.bin');
    warnings = [];
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('creates the secret once, encrypted, and returns the same one afterwards', () => {
    const store = new TelemetrySecretFile(file, fakeEncryptor());
    const secret = store.load();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fs.readFileSync(file, 'utf8')).not.toContain(secret);
    expect(new TelemetrySecretFile(file, fakeEncryptor()).load()).toBe(secret);
  });

  it('has no secret without secure storage, so nothing is sent', () => {
    expect(new TelemetrySecretFile(file, fakeEncryptor(false)).load()).toBeNull();
    expect(fs.existsSync(file)).toBe(false);
  });

  it('replaces a secret it cannot read, without logging it', () => {
    fs.writeFileSync(file, 'garbage');
    const secret = new TelemetrySecretFile(file, fakeEncryptor(), (m) => warnings.push(m)).load();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(warnings).toEqual(['The telemetry secret could not be read; a new one replaces it.']);
  });
});

describe('pushTelemetrySecret', () => {
  it('sends it to the internal route with the control token, retrying while the API starts', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    let ready = false;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (!ready) {
        ready = true;
        throw new TypeError('fetch failed');
      }
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    await pushTelemetrySecret({
      apiBaseUrl: 'http://127.0.0.1:4000',
      controlToken: 'control',
      secret: 'A'.repeat(43),
      fetch: fakeFetch,
      delayMs: 1,
    });

    expect(calls).toHaveLength(2);
    expect(calls[1]!.url).toBe('http://127.0.0.1:4000/internal/telemetry-secret');
    expect(calls[1]!.init).toMatchObject({
      method: 'PUT',
      headers: { Authorization: 'Bearer control' },
      body: JSON.stringify({ secret: 'A'.repeat(43) }),
    });
  });
});
