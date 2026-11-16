import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { AiKeyStore } from './ai-key-store.js';

describe('AiKeyStore', () => {
  it('starts empty and keeps the last key set', () => {
    const store = new AiKeyStore();
    expect(store.isConfigured()).toBe(false);

    store.set('  sk-ant-first ');
    store.set('sk-ant-second');
    expect(store.get()).toBe('sk-ant-second');
    expect(store.isConfigured()).toBe(true);
  });

  it.each([null, '', '   '])('treats %j as removing the key', (value) => {
    const store = new AiKeyStore();
    store.set('sk-ant-key');
    store.set(value);
    expect(store.get()).toBeNull();
  });

  it('does not expose the key when serialized or inspected', () => {
    const store = new AiKeyStore();
    store.set('sk-ant-secret');
    expect(JSON.stringify(store)).not.toContain('secret');
    expect(inspect(store, { depth: 5 })).not.toContain('secret');
  });
});
