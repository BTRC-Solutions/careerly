import { describe, expect, it } from 'vitest';
import { AiCredentialsSync } from './ai-credentials-sync.js';

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(statuses: number[]) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const status = statuses.shift() ?? 204;
    return new Response(null, { status });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe('AiCredentialsSync', () => {
  it('sends the active key to the internal route with the control token', async () => {
    const { calls, fetchImpl } = fakeFetch([204]);
    const sync = new AiCredentialsSync({
      apiBaseUrl: 'http://127.0.0.1:4317',
      controlToken: 'control-token',
      activeCredentials: () => ({ provider: 'gemini', apiKey: 'AIzaSyFakeKey_123456' }),
      fetch: fetchImpl,
    });

    await sync.push();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('http://127.0.0.1:4317/internal/ai-credentials');
    expect(calls[0]!.init.method).toBe('PUT');
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: 'Bearer control-token' });
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      credentials: { provider: 'gemini', apiKey: 'AIzaSyFakeKey_123456' },
    });
  });

  it('sends null when no key is configured', async () => {
    const { calls, fetchImpl } = fakeFetch([204]);
    const sync = new AiCredentialsSync({
      apiBaseUrl: 'http://api',
      controlToken: 't',
      activeCredentials: () => null,
      fetch: fetchImpl,
    });
    await sync.push();
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ credentials: null });
  });

  it('retries until the backend accepts and reports rejections without the key', async () => {
    const { calls, fetchImpl } = fakeFetch([503, 503, 204]);
    const sync = new AiCredentialsSync({
      apiBaseUrl: 'http://api',
      controlToken: 't',
      activeCredentials: () => ({ provider: 'gemini', apiKey: 'AIzaSyFakeKey_123456' }),
      fetch: fetchImpl,
    });
    await sync.pushWhenReady({ attempts: 5, delayMs: 1 });
    expect(calls).toHaveLength(3);

    const failing = new AiCredentialsSync({
      apiBaseUrl: 'http://api',
      controlToken: 't',
      activeCredentials: () => ({ provider: 'gemini', apiKey: 'AIzaSyFakeKey_123456' }),
      fetch: fakeFetch([401, 401]).fetchImpl,
    });
    const error = await failing.pushWhenReady({ attempts: 2, delayMs: 1 }).catch((e: unknown) => e);
    expect(String(error)).toContain('HTTP 401');
    expect(String(error)).not.toContain('AIzaSyFakeKey');
  });
});
