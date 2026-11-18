import { AchievementSuggestionSchema } from '@careerly/contracts';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createTempDir } from '../../test-support/temp-dir.js';
import {
  capturingLogger,
  type RunningServer,
  startTestServer,
  TEST_TOKEN,
  testConfig,
} from '../../test-support/test-server.js';

/*
 * Wording suggestions for achievements end to end (roadmap 4.8, RF-PROF-10): AI call through a fake Gemini,
 * the guard against invented numbers (RN-01), and nothing saved.
 */

const CONTROL_TOKEN = 'control-token-only-main-knows';
const KEY = 'AIzaSyFakeGeminiKey_0123456789';

const ACHIEVEMENT = {
  text: 'hice que el servicio de pagos ande mas rapido, bajando la latencia p95 un 40% con cache en Redis',
  metrics: '-40% p95',
};

const GOOD = {
  text: 'Reduje la latencia p95 del servicio de pagos incorporando una caché en Redis.',
  metrics: '-40 % latencia p95',
  questions: ['¿Cuántas transacciones por día procesa el servicio?', '  '],
};

const INVENTED = {
  text: 'Reduje un 40% la latencia p95 del servicio de pagos, que procesa 2M de transacciones diarias.',
  metrics: '-40% p95',
  questions: [],
};

/** A fake Gemini that answers each call with the next answer of the list (the last one repeats). */
function startFakeGemini(answers: unknown[]) {
  const sent: string[] = [];
  const server = http.createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      sent.push(raw);
      const answer = answers[Math.min(sent.length - 1, answers.length - 1)];
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: JSON.stringify(answer) }] }, finishReason: 'STOP' },
          ],
          usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 80 },
        }),
      );
    });
  });
  return new Promise<{ url: string; sent: string[]; close(): Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        sent,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

describe('achievement wording suggestions (integration)', () => {
  let temp: ReturnType<typeof createTempDir> | undefined;
  let gemini: Awaited<ReturnType<typeof startFakeGemini>> | undefined;
  let server: RunningServer | undefined;
  let logs: ReturnType<typeof capturingLogger>;

  afterEach(async () => {
    await server?.close();
    await gemini?.close();
    temp?.cleanup();
    server = undefined;
    gemini = undefined;
    temp = undefined;
  });

  async function start(answers: unknown[], { withKey = true } = {}) {
    temp = createTempDir();
    gemini = await startFakeGemini(answers);
    logs = capturingLogger();
    server = await startTestServer(
      testConfig(temp.dir, {
        CAREERLY_CONTROL_TOKEN: CONTROL_TOKEN,
        CAREERLY_GEMINI_BASE_URL: gemini.url,
      }),
      logs.logger,
    );
    // Electron always sends the credentials at startup, `null` when there is no key.
    await fetch(`http://127.0.0.1:${server.port}/internal/ai-credentials`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${CONTROL_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials: withKey ? { provider: 'gemini', apiKey: KEY } : null }),
    });
  }

  const api = (method: string, route: string, body?: unknown) =>
    fetch(`http://127.0.0.1:${server!.port}${route}`, {
      method,
      headers: { Authorization: `Bearer ${TEST_TOKEN}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const suggest = (body: unknown = ACHIEVEMENT) =>
    api('POST', '/profile/achievements/suggestions', body);

  it('suggests a wording with the same facts and saves nothing', async () => {
    await start([GOOD]);
    const before = await (await api('GET', '/profile')).json();

    const response = await suggest();
    expect(response.status).toBe(200);
    expect(AchievementSuggestionSchema.parse(await response.json())).toEqual({
      text: GOOD.text,
      metrics: GOOD.metrics,
      // Blank questions are dropped.
      questions: ['¿Cuántas transacciones por día procesa el servicio?'],
    });

    expect(await (await api('GET', '/profile')).json()).toEqual(before);
    // The achievement went to the model as untrusted data, and is not in the logs.
    expect(gemini!.sent[0]).toContain('<untrusted source=\\"achievement\\">');
    expect(logs.output()).not.toContain('Redis');
    expect(logs.output()).not.toContain('Reduje');
  });

  it('asks again when the answer adds a number, and uses the second one', async () => {
    await start([INVENTED, GOOD]);
    const response = await suggest();
    expect(response.status).toBe(200);
    expect(((await response.json()) as { text: string }).text).toBe(GOOD.text);
    expect(gemini!.sent).toHaveLength(2);
  });

  it('never shows an answer with invented data', async () => {
    await start([INVENTED]);
    const response = await suggest();
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { code: 'AI_UNFAITHFUL' } });
    expect(gemini!.sent).toHaveLength(2);
  });

  it('explains when there is no AI key', async () => {
    await start([GOOD], { withKey: false });
    const response = await suggest();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'AI_NOT_CONFIGURED' } });
    expect(gemini!.sent).toHaveLength(0);
  });

  it('rejects an empty achievement', async () => {
    await start([GOOD]);
    expect((await suggest({ text: '  ', metrics: null })).status).toBe(400);
    expect(gemini!.sent).toHaveLength(0);
  });
});
