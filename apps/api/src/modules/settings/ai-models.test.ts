import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { AiModelsResponseSchema } from '@careerly/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LlmClient } from '../ai/index.js';
import { createTempDir } from '../../test-support/temp-dir.js';
import {
  type RunningServer,
  startTestServer,
  TEST_TOKEN,
  testConfig,
} from '../../test-support/test-server.js';

const CONTROL_TOKEN = 'control-token-for-the-tests';
const KEY = 'AIzaSyFakeGeminiKey_0123456789';

/** What the fake Gemini lists for the key (the TTS and embedding models must be left out). */
const LISTED = [
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.7-pro-preview',
  'gemma-4-27b-it',
  'gemini-3.5-flash-preview-tts',
];

/**
 * Fake Gemini: lists models and answers `generateContent` per model. `retired` models answer 404
 * and `gemma-*` answers text that is not JSON (no structured output).
 */
function startFakeGemini() {
  const generated: string[] = [];
  const retired = new Set<string>();
  const server = http.createServer((request, response) => {
    const url = request.url ?? '';
    request.resume();
    request.on('end', () => {
      const reply = (status: number, body: unknown) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(body));
      };
      if (request.method === 'GET' && url.startsWith('/v1beta/models')) {
        return reply(200, {
          models: [
            ...LISTED.map((id) => ({
              name: `models/${id}`,
              supportedGenerationMethods: ['generateContent'],
            })),
            { name: 'models/text-embedding-005', supportedGenerationMethods: ['embedContent'] },
          ],
        });
      }
      const model = decodeURIComponent(/models\/([^:]+):generateContent/.exec(url)?.[1] ?? '');
      generated.push(model);
      if (retired.has(model)) {
        return reply(404, { error: { status: 'NOT_FOUND' } });
      }
      const text = model.startsWith('gemma')
        ? 'Sure! Hola.'
        : JSON.stringify({ ok: true, greeting: 'hola' });
      reply(200, {
        candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      });
    });
  });
  return new Promise<{
    url: string;
    generated: string[];
    retired: Set<string>;
    close(): Promise<void>;
  }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        generated,
        retired,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

describe('AI model choice (integration)', () => {
  let temp: ReturnType<typeof createTempDir> | undefined;
  let gemini: Awaited<ReturnType<typeof startFakeGemini>> | undefined;
  let server: RunningServer;

  /** Starts the API; a second call (after `server.close()`) keeps the same data and fake Gemini. */
  async function start(withKey = true) {
    temp ??= createTempDir();
    gemini ??= await startFakeGemini();
    server = await startTestServer(
      testConfig(temp.dir, {
        CAREERLY_CONTROL_TOKEN: CONTROL_TOKEN,
        CAREERLY_GEMINI_BASE_URL: gemini!.url,
      }),
    );
    if (withKey) {
      await fetch(`http://127.0.0.1:${server.port}/internal/ai-credentials`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${CONTROL_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: { provider: 'gemini', apiKey: KEY } }),
      });
    }
  }

  async function api(method: string, body?: unknown) {
    const response = await fetch(`http://127.0.0.1:${server.port}/settings/ai-models`, {
      method,
      headers: { Authorization: `Bearer ${TEST_TOKEN}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as unknown };
  }

  const overview = async () => AiModelsResponseSchema.parse((await api('GET')).body);

  /** A small-tier call, as a feature would make it. */
  async function callSmallTier() {
    gemini!.generated.length = 0;
    await server.app.get(LlmClient).generateStructured({
      task: 'smoke-test',
      prompt: { id: 'test.v1', system: 'Test.' },
      tier: 'small',
      input: [{ type: 'text', text: 'Say hola.' }],
      schema: z.object({ ok: z.boolean() }),
    });
    return [...gemini!.generated];
  }

  afterEach(async () => {
    await server?.close();
    await gemini?.close();
    temp?.cleanup();
    temp = undefined;
    gemini = undefined;
  });

  it('lists the text models of the key with what the catalog knows about them', async () => {
    await start();

    const { provider, tiers, models } = await overview();

    expect(provider).toBe('gemini');
    expect(tiers.small).toEqual({ selected: null, defaults: expect.any(Array) as string[] });
    expect(models.map((model) => model.id)).toEqual(LISTED.slice(0, 4));
    expect(models[0]).toEqual({
      id: 'gemini-3.5-flash-lite',
      available: true,
      inputUsdPerMTok: 0.3,
      outputUsdPerMTok: 2.5,
      recommendedFor: ['small'],
      tested: true,
    });
    expect(models.find((model) => model.id === 'gemini-3.7-pro-preview')).toMatchObject({
      inputUsdPerMTok: null,
      recommendedFor: [],
      tested: false,
    });
  });

  it('tries a model before saving it; the choice survives a restart and calls use it', async () => {
    await start();

    const saved = await api('PUT', { tier: 'small', model: 'gemini-3.7-pro-preview' });
    expect(saved.status).toBe(200);
    expect(gemini!.generated).toEqual(['gemini-3.7-pro-preview']);
    expect(AiModelsResponseSchema.parse(saved.body).tiers.small.selected).toBe(
      'gemini-3.7-pro-preview',
    );

    await server.close();
    await start();
    expect((await overview()).tiers.small.selected).toBe('gemini-3.7-pro-preview');
    expect(await callSmallTier()).toEqual(['gemini-3.7-pro-preview']);
  });

  it('does not save a model that fails the test call', async () => {
    await start();
    gemini!.retired.add('gemini-9-ultra');

    const missing = await api('PUT', { tier: 'large', model: 'gemini-9-ultra' });
    const unstructured = await api('PUT', { tier: 'large', model: 'gemma-4-27b-it' });

    expect(missing).toMatchObject({
      status: 409,
      body: { error: { code: 'AI_MODEL_UNAVAILABLE' } },
    });
    expect(unstructured).toMatchObject({ status: 502, body: { error: { code: 'AI_FAILED' } } });
    expect((await overview()).tiers.large.selected).toBeNull();
  });

  it('a retired chosen model does not break the app: calls fall back to the defaults', async () => {
    await start();
    await api('PUT', { tier: 'small', model: 'gemini-3.7-pro-preview' });
    gemini!.retired.add('gemini-3.7-pro-preview');

    const calls = await callSmallTier();
    const { models } = await overview();

    expect(calls[0]).toBe('gemini-3.7-pro-preview');
    expect(calls.at(-1)).toBe('gemini-3.5-flash-lite');
    expect(models.find((model) => model.id === 'gemini-3.7-pro-preview')?.available).toBe(true);
  });

  it('shows a chosen model the key no longer lists as unavailable', async () => {
    await start();
    await api('PUT', { tier: 'large', model: 'gemini-3.0-flash-old' });

    const { models, tiers } = await overview();

    expect(tiers.large.selected).toBe('gemini-3.0-flash-old');
    expect(models.at(-1)).toMatchObject({ id: 'gemini-3.0-flash-old', available: false });
  });

  it('goes back to the defaults with null', async () => {
    await start();
    await api('PUT', { tier: 'small', model: 'gemini-3.6-flash' });

    const reset = await api('PUT', { tier: 'small', model: null });

    expect(AiModelsResponseSchema.parse(reset.body).tiers.small.selected).toBeNull();
    expect(await callSmallTier()).toEqual(['gemini-3.5-flash-lite']);
  });

  it('needs a configured key and a valid model id', async () => {
    await start(false);

    expect(await api('GET')).toMatchObject({
      status: 409,
      body: { error: { code: 'AI_NOT_CONFIGURED' } },
    });
    expect((await api('PUT', { tier: 'small', model: 'Not A Model!' })).status).toBe(400);
    expect((await api('PUT', { tier: 'medium', model: null })).status).toBe(400);
  });
});
