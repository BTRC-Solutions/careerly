import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../../platform/database/database.service.js';
import { createTempDir } from '../../test-support/temp-dir.js';
import {
  capturingLogger,
  type RunningServer,
  startTestServer,
  testConfig,
} from '../../test-support/test-server.js';

const CONTROL_TOKEN = 'control-token-for-the-tests';
const KEY = 'AIzaSyFakeGeminiKey_0123456789';

/** Fake Gemini that returns a fixed structured answer. */
function startFakeGemini(answer: string, status = 200) {
  const server = http.createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify(
          status === 200
            ? {
                candidates: [{ content: { parts: [{ text: answer }] }, finishReason: 'STOP' }],
                usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 10 },
              }
            : { error: { status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } },
        ),
      );
    });
  });
  return new Promise<{ url: string; close(): Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

describe('AI smoke test route (integration)', () => {
  let temp: ReturnType<typeof createTempDir>;
  let gemini: Awaited<ReturnType<typeof startFakeGemini>>;
  let server: RunningServer;
  let logs: ReturnType<typeof capturingLogger>;

  async function start(answer: string, status = 200) {
    temp = createTempDir();
    gemini = await startFakeGemini(answer, status);
    logs = capturingLogger();
    server = await startTestServer(
      testConfig(temp.dir, {
        CAREERLY_CONTROL_TOKEN: CONTROL_TOKEN,
        CAREERLY_GEMINI_BASE_URL: gemini.url,
      }),
      logs.logger,
    );
  }

  const internal = (path: string, method: string, body?: unknown) =>
    fetch(`http://127.0.0.1:${server.port}${path}`, {
      method,
      headers: { Authorization: `Bearer ${CONTROL_TOKEN}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const rows = () =>
    server.app
      .get(DatabaseService)
      .connection.prepare('SELECT * FROM ai_generations ORDER BY created_at')
      .all();

  beforeEach(() => {
    temp = undefined as unknown as typeof temp;
  });
  afterEach(async () => {
    await server?.close();
    await gemini?.close();
    temp?.cleanup();
  });

  it('runs a structured call with the active key and records usage without content', async () => {
    await start('{"ok":true,"greeting":"hola"}');
    await internal('/internal/ai-credentials', 'PUT', {
      credentials: { provider: 'gemini', apiKey: KEY },
    });

    const response = await internal('/internal/ai/smoke', 'POST');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'OK',
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      attempts: 1,
      inputTokens: 40,
      outputTokens: 10,
    });

    const stored = rows();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      task: 'smoke-test',
      provider: 'gemini',
      prompt_version: 'smoke-test.v1',
      status: 'SUCCEEDED',
      input_tokens: 40,
      output_tokens: 10,
    });
    const everything = JSON.stringify(stored) + logs.output();
    expect(everything).not.toContain(KEY);
    expect(everything).not.toContain('hola');
    expect(everything).not.toContain('Spanish word');
  });

  it('reports NOT_CONFIGURED without a key and KEY_REJECTED for a wrong one', async () => {
    await start('', 400);
    expect(await (await internal('/internal/ai/smoke', 'POST')).json()).toMatchObject({
      status: 'NOT_CONFIGURED',
    });

    await internal('/internal/ai-credentials', 'PUT', {
      credentials: { provider: 'gemini', apiKey: KEY },
    });
    expect(await (await internal('/internal/ai/smoke', 'POST')).json()).toMatchObject({
      status: 'KEY_REJECTED',
    });
    expect(rows()[0]).toMatchObject({ status: 'FAILED', error_code: 'KEY_REJECTED' });
  });

  it('is not reachable with the interface token', async () => {
    await start('{}');
    const response = await fetch(`http://127.0.0.1:${server.port}/internal/ai/smoke`, {
      method: 'POST',
      headers: { Authorization: 'Bearer integration-test-token' },
    });
    expect(response.status).toBe(401);
  });
});
