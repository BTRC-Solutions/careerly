import { AiStatusSchema, AiUsageResponseSchema } from '@careerly/contracts';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTempDir } from '../../test-support/temp-dir.js';
import {
  type RunningServer,
  startTestServer,
  TEST_TOKEN,
  testConfig,
} from '../../test-support/test-server.js';
import { type AiGenerationEntry, AiGenerationRepository } from './application/llm.ports.js';
import { AiCredentialsStore } from './index.js';

const GEMINI_KEY = 'AIzaSyFakeGeminiKey_0123456789';

describe('AI usage and status (integration)', () => {
  let temp: ReturnType<typeof createTempDir>;
  let server: RunningServer;

  beforeEach(async () => {
    temp = createTempDir();
    server = await startTestServer(testConfig(temp.dir));
  });

  afterEach(async () => {
    await server.close();
    temp.cleanup();
  });

  function get(path: string) {
    return fetch(`http://127.0.0.1:${server.port}${path}`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
  }

  function record(overrides: Partial<AiGenerationEntry>) {
    return server.app.get(AiGenerationRepository).record({
      id: randomUUID(),
      task: 'cv-import',
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      promptVersion: 'cv-import.v1',
      attempt: 1,
      status: 'SUCCEEDED',
      inputTokens: 1000,
      outputTokens: 100,
      costUsd: 0.00055,
      latencyMs: 900,
      errorCode: null,
      createdAt: new Date().toISOString(),
      ...overrides,
    });
  }

  it('reports the usage of a month from the recorded calls', async () => {
    await record({});
    await record({ task: 'smoke-test', inputTokens: 20, outputTokens: 5, costUsd: 0.00001 });
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const response = await get('/ai/usage');
    expect(response.status).toBe(200);
    const usage = AiUsageResponseSchema.parse(await response.json());

    expect(usage.month).toBe(month);
    expect(usage.totals).toEqual({
      calls: 2,
      inputTokens: 1020,
      outputTokens: 105,
      costUsd: 0.00056,
    });
    expect(usage.byTask.map((entry) => entry.task)).toEqual(['cv-import', 'smoke-test']);
    expect(usage.byMonth.at(-1)).toMatchObject({ month, calls: 2 });

    const older = AiUsageResponseSchema.parse(await (await get('/ai/usage?month=2020-01')).json());
    expect(older.totals.calls).toBe(0);
  });

  it('rejects a malformed month', async () => {
    expect((await get('/ai/usage?month=2026-13')).status).toBe(400);
    expect((await get('/ai/usage?month=2026-11&x=1')).status).toBe(400);
  });

  it('says whether AI is configured and whether the key was rejected since it was set', async () => {
    const status = async () => AiStatusSchema.parse(await (await get('/ai/status')).json());
    expect(await status()).toEqual({ configured: false, provider: null, keyRejected: false });

    const keys = server.app.get(AiCredentialsStore);
    keys.set({ provider: 'gemini', apiKey: GEMINI_KEY });
    expect(await status()).toEqual({ configured: true, provider: 'gemini', keyRejected: false });

    const later = () => new Promise((resolve) => setTimeout(resolve, 5));
    await record({ status: 'FAILED', errorCode: 'KEY_REJECTED' });
    expect((await status()).keyRejected).toBe(true);

    // A later successful call clears it…
    await later();
    await record({});
    expect((await status()).keyRejected).toBe(false);

    // …and so does a new key, even if the last call with the old one was rejected.
    await later();
    await record({ status: 'FAILED', errorCode: 'KEY_REJECTED' });
    expect((await status()).keyRejected).toBe(true);
    await later();
    keys.set({ provider: 'gemini', apiKey: `${GEMINI_KEY}x` });
    expect((await status()).keyRejected).toBe(false);
  });
});
