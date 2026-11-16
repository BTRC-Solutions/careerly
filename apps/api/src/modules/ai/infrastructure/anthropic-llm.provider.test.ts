import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '../../../platform/config/app-config.js';
import {
  AiBlockedError,
  AiKeyRejectedError,
  AiModelUnavailableError,
  AiRateLimitedError,
} from '../application/llm-errors.js';
import { AnthropicLlmProvider } from './anthropic-llm.provider.js';
import { toClaudeJsonSchema } from './anthropic-models.js';

const KEY = 'sk-ant-api03-fake-key-for-tests';

interface Received {
  url: string;
  headers: http.IncomingHttpHeaders;
  body: Record<string, unknown>;
}

/** A fake Messages API that streams `text` as Anthropic does (SSE), or answers an error. */
function startFakeAnthropic(reply: { status?: number; text?: string; stopReason?: string }) {
  const received: Received[] = [];
  const server = http.createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      received.push({
        url: request.url ?? '',
        headers: request.headers,
        body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
      });
      if (request.url?.startsWith('/v1/models')) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        return response.end(
          JSON.stringify({
            data: [
              {
                type: 'model',
                id: 'claude-opus-5-5',
                display_name: 'Opus',
                created_at: '2026-01-01T00:00:00Z',
              },
              {
                type: 'model',
                id: 'claude-haiku-5-5',
                display_name: 'Haiku',
                created_at: '2026-01-01T00:00:00Z',
              },
            ],
            has_more: false,
            first_id: 'claude-opus-5-5',
            last_id: 'claude-haiku-5-5',
          }),
        );
      }
      if (reply.status && reply.status !== 200) {
        response.writeHead(reply.status, { 'Content-Type': 'application/json' });
        return response.end(
          JSON.stringify({ type: 'error', error: { type: 'some_error', message: 'nope' } }),
        );
      }
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const event = (type: string, data: unknown) =>
        response.write(
          `event: ${type}\ndata: ${JSON.stringify({ type, ...(data as object) })}\n\n`,
        );
      event('message_start', {
        message: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-haiku-5-5',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 120, output_tokens: 1 },
        },
      });
      event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
      event('content_block_delta', {
        index: 0,
        delta: { type: 'text_delta', text: reply.text ?? '' },
      });
      event('content_block_stop', { index: 0 });
      event('message_delta', {
        delta: { stop_reason: reply.stopReason ?? 'end_turn', stop_sequence: null },
        usage: { output_tokens: 30 },
      });
      event('message_stop', {});
      response.end();
    });
  });
  return new Promise<{ url: string; received: Received[]; close(): Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        received,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

const provider = (baseUrl: string) =>
  new AnthropicLlmProvider({
    aiBaseUrls: { gemini: 'http://unused', anthropic: baseUrl },
    anthropicModels: {
      small: ['claude-haiku-5-5'],
      large: ['claude-opus-5-5', 'claude-sonnet-5-5'],
    },
  } as unknown as AppConfig);

const request = (model: string) => ({
  apiKey: KEY,
  model,
  system: 'Extract.',
  turns: [
    {
      role: 'user' as const,
      parts: [
        { type: 'text' as const, text: 'Read this CV.' },
        {
          type: 'document' as const,
          mimeType: 'application/pdf' as const,
          data: Buffer.from('%PDF-1.7'),
        },
      ],
    },
  ],
  jsonSchema: {
    type: 'object',
    properties: { name: { type: 'string', minLength: 1 }, years: { type: 'integer', minimum: 0 } },
    required: ['name', 'years'],
  },
  timeoutMs: 10_000,
});

describe('AnthropicLlmProvider', () => {
  let fake: Awaited<ReturnType<typeof startFakeAnthropic>> | undefined;
  afterEach(async () => {
    await fake?.close();
    fake = undefined;
  });

  it('asks for structured output and returns the text and the tokens', async () => {
    fake = await startFakeAnthropic({ text: '{"name":"Lucía","years":5}' });

    const answer = await provider(fake.url).generateJson(request('claude-haiku-5-5'));

    expect(answer).toEqual({
      text: '{"name":"Lucía","years":5}',
      inputTokens: 120,
      outputTokens: 30,
    });
    const { headers, body } = fake.received[0]!;
    // The SDK sends the key in one of its auth headers.
    expect([headers['x-api-key'], headers.authorization]).toContainEqual(
      expect.stringContaining(KEY),
    );
    expect(body).toMatchObject({
      model: 'claude-haiku-5-5',
      system: 'Extract.',
      stream: true,
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: { name: { type: 'string' }, years: { type: 'integer' } },
            additionalProperties: false,
          },
        },
      },
    });
    // The PDF goes before the text that refers to it.
    const content = (body.messages as { content: { type: string }[] }[])[0]!.content;
    expect(content.map((block) => block.type)).toEqual(['document', 'text']);
    // Haiku has no server-side refusal fallback.
    expect(body).not.toHaveProperty('fallbacks');
  });

  it('turns on refusal fallbacks for the models that support them', async () => {
    fake = await startFakeAnthropic({ text: '{"name":"x","years":1}' });
    await provider(fake.url).generateJson(request('claude-opus-5-5'));
    const { headers, body } = fake.received[0]!;
    expect(body.fallbacks).toBe('default');
    expect(headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
  });

  it('maps refusals and HTTP errors to AI errors', async () => {
    fake = await startFakeAnthropic({ text: '', stopReason: 'refusal' });
    await expect(provider(fake.url).generateJson(request('claude-haiku-5-5'))).rejects.toThrow(
      AiBlockedError,
    );
    await fake.close();

    const cases: [number, unknown][] = [
      [401, AiKeyRejectedError],
      [429, AiRateLimitedError],
      [404, AiModelUnavailableError],
      [529, AiModelUnavailableError],
    ];
    for (const [status, errorClass] of cases) {
      fake = await startFakeAnthropic({ status });
      await expect(
        provider(fake.url).generateJson(request('claude-haiku-5-5')),
      ).rejects.toBeInstanceOf(errorClass);
      await fake.close();
    }
    fake = undefined;
  });

  it('lists the Claude models of the key', async () => {
    fake = await startFakeAnthropic({});
    expect(await provider(fake.url).listModels(KEY)).toEqual([
      'claude-haiku-5-5',
      'claude-opus-5-5',
    ]);
  });

  it('keeps nested objects closed and drops unsupported constraints', () => {
    expect(
      toClaudeJsonSchema({
        type: 'object',
        properties: {
          items: {
            type: 'array',
            maxItems: 3,
            items: { type: 'object', properties: { a: { type: 'string', pattern: '^x' } } },
          },
          maybe: { anyOf: [{ type: 'object', properties: {} }, { type: 'null' }] },
        },
      }),
    ).toEqual({
      type: 'object',
      additionalProperties: false,
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { a: { type: 'string' } },
          },
        },
        maybe: {
          anyOf: [
            { type: 'object', additionalProperties: false, properties: {} },
            { type: 'null' },
          ],
        },
      },
    });
  });
});
