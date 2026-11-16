import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../platform/config/app-config.js';
import {
  AiBlockedError,
  AiKeyRejectedError,
  AiModelUnavailableError,
  AiRateLimitedError,
  AiUnavailableError,
} from '../application/llm-errors.js';
import type { ProviderRequest } from '../application/llm.types.js';
import { GeminiLlmProvider } from './gemini-llm.provider.js';

const KEY = 'AIzaSyFakeGeminiKey_0123456789';

interface Received {
  url: string | undefined;
  apiKey: string | undefined;
  body: Record<string, unknown>;
}

/** Fake Gemini endpoint: answers with whatever the test queued. */
function startFakeGemini() {
  const received: Received[] = [];
  const replies: { status: number; body: unknown; delayMs?: number }[] = [];
  const server = http.createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      received.push({
        url: request.url,
        apiKey: request.headers['x-goog-api-key'] as string | undefined,
        body: JSON.parse(raw) as Record<string, unknown>,
      });
      const reply = replies.shift() ?? { status: 500, body: {} };
      setTimeout(() => {
        response.writeHead(reply.status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(reply.body));
      }, reply.delayMs ?? 0);
    });
  });
  return new Promise<{
    url: string;
    received: Received[];
    replies: typeof replies;
    close(): Promise<void>;
  }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        received,
        replies,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

const ok = (text: string) => ({
  status: 200,
  body: {
    candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 80, thoughtsTokenCount: 20 },
  },
});

describe('GeminiLlmProvider (integration with a fake Gemini)', () => {
  let fake: Awaited<ReturnType<typeof startFakeGemini>>;
  let provider: GeminiLlmProvider;

  const request = (overrides: Partial<ProviderRequest> = {}): ProviderRequest => ({
    apiKey: KEY,
    model: 'gemini-2.5-flash',
    system: 'Answer with JSON.',
    turns: [
      {
        role: 'user',
        parts: [
          { type: 'text', text: 'Read this CV.' },
          { type: 'document', mimeType: 'application/pdf', data: Buffer.from('%PDF-1.7 fake') },
        ],
      },
    ],
    jsonSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
    timeoutMs: 5_000,
    ...overrides,
  });

  beforeEach(async () => {
    fake = await startFakeGemini();
    provider = new GeminiLlmProvider(
      loadConfig(
        {
          CAREERLY_DATA_DIR: '.',
          CAREERLY_API_TOKEN: 'integration-test-token',
          CAREERLY_GEMINI_BASE_URL: fake.url,
        },
        { defaultMigrationsDir: '.' },
      ),
    );
  });
  afterEach(() => fake.close());

  it('sends a generateContent request with JSON-schema output and the key in a header', async () => {
    fake.replies.push(ok('{"ok":true}'));

    const response = await provider.generateJson(request());

    expect(response).toEqual({ text: '{"ok":true}', inputTokens: 1200, outputTokens: 100 });
    const sent = fake.received[0]!;
    expect(sent.url).toBe('/v1beta/models/gemini-2.5-flash:generateContent');
    expect(sent.url).not.toContain(KEY);
    expect(sent.apiKey).toBe(KEY);
    expect(sent.body).toEqual({
      systemInstruction: { parts: [{ text: 'Answer with JSON.' }] },
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Read this CV.' },
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: Buffer.from('%PDF-1.7 fake').toString('base64'),
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
        temperature: 0,
      },
    });
  });

  it('ignores "thought" parts and joins the answer text', async () => {
    fake.replies.push({
      status: 200,
      body: {
        candidates: [
          {
            content: {
              parts: [{ text: 'thinking…', thought: true }, { text: '{"a":' }, { text: '1}' }],
            },
            finishReason: 'STOP',
          },
        ],
      },
    });
    expect((await provider.generateJson(request())).text).toBe('{"a":1}');
  });

  it.each([
    [
      'a wrong key (400 API_KEY_INVALID)',
      {
        status: 400,
        body: { error: { status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } },
      },
      AiKeyRejectedError,
    ],
    ['a forbidden key (403)', { status: 403, body: {} }, AiKeyRejectedError],
    ['a rate limit (429)', { status: 429, body: {} }, AiRateLimitedError],
    ['a provider error (500)', { status: 500, body: {} }, AiUnavailableError],
    ['an overloaded model (503)', { status: 503, body: {} }, AiModelUnavailableError],
    ['a retired model (404)', { status: 404, body: {} }, AiModelUnavailableError],
    [
      'a blocked prompt',
      { status: 200, body: { promptFeedback: { blockReason: 'SAFETY' } } },
      AiBlockedError,
    ],
    [
      'a safety stop',
      {
        status: 200,
        body: { candidates: [{ content: { parts: [{ text: '{}' }] }, finishReason: 'SAFETY' }] },
      },
      AiBlockedError,
    ],
    ['an empty answer', { status: 200, body: { candidates: [] } }, AiBlockedError],
  ])('maps %s', async (_case, reply, ErrorClass) => {
    fake.replies.push(reply);
    await expect(provider.generateJson(request())).rejects.toBeInstanceOf(ErrorClass);
  });

  it('times out as unavailable', async () => {
    fake.replies.push({ ...ok('{}'), delayMs: 500 });
    await expect(provider.generateJson(request({ timeoutMs: 50 }))).rejects.toMatchObject({
      name: 'AiUnavailableError',
      message: expect.stringContaining('timeout'),
    });
  });

  it('uses the configured models and estimates cost (thinking billed as output)', () => {
    expect(provider.modelsFor('small')).toEqual([
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
    ]);
    expect(provider.modelsFor('large')[0]).toBe('gemini-3.6-flash');
    // 1M input + 1M output: $0.30 + $2.50 for Flash-Lite, $1.50 + $7.50 for 3.6 Flash.
    expect(provider.estimateCostUsd('gemini-3.5-flash-lite', 1_000_000, 1_000_000)).toBeCloseTo(
      2.8,
    );
    expect(provider.estimateCostUsd('gemini-3.6-flash', 1_000_000, 1_000_000)).toBeCloseTo(9);
    expect(provider.estimateCostUsd('some-new-model', 1_000, 1_000)).toBe(0);
  });
});
