import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { AiCredentialsStore } from './ai-credentials.store.js';

const KEY = 'AIzaSyFakeGeminiKey_0123456789';

describe('AiCredentialsStore', () => {
  it('holds and clears the active provider and key', () => {
    const store = new AiCredentialsStore();
    expect(store.get()).toBeNull();

    store.set({ provider: 'gemini', apiKey: KEY });
    expect(store.get()).toEqual({ provider: 'gemini', apiKey: KEY });
    expect(store.activeProvider()).toBe('gemini');

    store.set(null);
    expect(store.get()).toBeNull();
    expect(store.activeProvider()).toBeNull();
  });

  it('keeps the key out of JSON and inspection (it can never end up in a log by accident)', () => {
    const store = new AiCredentialsStore();
    store.set({ provider: 'gemini', apiKey: KEY });
    expect(JSON.stringify(store)).not.toContain(KEY);
    expect(inspect(store, { depth: 10 })).not.toContain(KEY);
  });

  it('returns copies, so callers cannot change what is stored', () => {
    const store = new AiCredentialsStore();
    store.set({ provider: 'gemini', apiKey: KEY });
    const copy = store.get()!;
    copy.apiKey = 'changed';
    expect(store.get()?.apiKey).toBe(KEY);
  });
});
