import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AiKeyStore,
  type Encryptor,
  ProviderNotConfiguredError,
  SecureStorageUnavailableError,
} from './ai-key-store.js';

const GEMINI_KEY = 'AIzaSyFakeGeminiKey_0123456789';
const CLAUDE_KEY = 'sk-ant-fake-claude-key-0123456789';

/** Reversible but non-trivial "encryption", so the tests can prove nothing is stored in plain text. */
function fakeEncryptor(available = true): Encryptor & { available: boolean } {
  return {
    available,
    isAvailable() {
      return this.available;
    },
    encrypt: (text) =>
      Buffer.from(Buffer.from(text, 'utf8').toString('base64').split('').reverse().join('')),
    decrypt: (buffer) =>
      Buffer.from(buffer.toString().split('').reverse().join(''), 'base64').toString('utf8'),
  };
}

describe('AiKeyStore', () => {
  let dir: string;
  let file: string;
  let warnings: string[];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'careerly-secrets-'));
    file = path.join(dir, 'secrets.bin');
    warnings = [];
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const store = (encryptor: Encryptor = fakeEncryptor()) =>
    new AiKeyStore(file, encryptor, (message) => warnings.push(message));

  it('starts empty', () => {
    expect(store().status()).toEqual({
      activeProvider: null,
      configured: { gemini: false, anthropic: false },
      secureStorageAvailable: true,
    });
    expect(store().activeCredentials()).toBeNull();
  });

  it('saves keys per provider, activates the last saved one and persists them', () => {
    store().save('gemini', GEMINI_KEY);
    expect(store().activeCredentials()).toEqual({ provider: 'gemini', apiKey: GEMINI_KEY });

    const status = store().save('anthropic', ` ${CLAUDE_KEY} `);
    expect(status).toMatchObject({
      activeProvider: 'anthropic',
      configured: { gemini: true, anthropic: true },
    });
    expect(store().activeCredentials()).toEqual({ provider: 'anthropic', apiKey: CLAUDE_KEY });

    store().setActive('gemini');
    expect(store().activeCredentials()?.provider).toBe('gemini');
  });

  it('never writes a key in plain text (RNF-03)', () => {
    store().save('gemini', GEMINI_KEY);
    const raw = fs.readFileSync(file);
    expect(raw.includes(GEMINI_KEY)).toBe(false);
    expect(raw.toString('utf8')).not.toContain('gemini');
    expect(fs.readdirSync(dir)).toEqual(['secrets.bin']);
  });

  it('removing the active key falls back to another configured provider', () => {
    store().save('gemini', GEMINI_KEY);
    store().save('anthropic', CLAUDE_KEY);

    expect(store().remove('anthropic').activeProvider).toBe('gemini');
    expect(store().remove('gemini')).toMatchObject({
      activeProvider: null,
      configured: { gemini: false, anthropic: false },
    });
    expect(store().activeCredentials()).toBeNull();
  });

  it('refuses to save when there is no secure storage', () => {
    const unavailable = fakeEncryptor(false);
    expect(() => store(unavailable).save('gemini', GEMINI_KEY)).toThrow(
      SecureStorageUnavailableError,
    );
    expect(fs.existsSync(file)).toBe(false);
    expect(store(unavailable).status().secureStorageAvailable).toBe(false);
  });

  it('rejects malformed keys and activating a provider without a key', () => {
    expect(() => store().save('gemini', 'short')).toThrow();
    expect(() => store().save('gemini', 'has spaces in the middle')).toThrow();
    expect(() => store().setActive('anthropic')).toThrow(ProviderNotConfiguredError);
  });

  it('treats an unreadable file as empty and warns without leaking content', () => {
    fs.writeFileSync(file, 'not an encrypted payload');
    expect(store().activeCredentials()).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).not.toContain('payload');
  });
});
