import { afterEach, describe, expect, it } from 'vitest';
import { createTempDir } from '../../test-support/temp-dir.js';
import {
  capturingLogger,
  type RunningServer,
  startTestServer,
  TEST_TOKEN,
  testConfig,
} from '../../test-support/test-server.js';
import { AiCredentialsStore } from './index.js';

const CONTROL_TOKEN = 'control-token-only-main-knows';
const GEMINI_KEY = 'AIzaSyFakeGeminiKey_0123456789';

describe('internal AI credentials (integration)', () => {
  let temp: ReturnType<typeof createTempDir> | undefined;
  let server: RunningServer | undefined;
  let logs: ReturnType<typeof capturingLogger>;

  async function start(env: NodeJS.ProcessEnv = { CAREERLY_CONTROL_TOKEN: CONTROL_TOKEN }) {
    temp = createTempDir();
    logs = capturingLogger();
    server = await startTestServer(testConfig(temp.dir, env), logs.logger);
  }

  afterEach(async () => {
    await server?.close();
    temp?.cleanup();
    server = undefined;
    temp = undefined;
  });

  function put(
    body: unknown,
    token: string,
    headers: Record<string, string> = {},
    path = '/internal/ai-credentials',
  ) {
    return fetch(`http://127.0.0.1:${server!.port}${path}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  const store = () => server!.app.get(AiCredentialsStore);

  it('main sets and clears the key in memory with the control token', async () => {
    await start();
    const set = await put(
      { credentials: { provider: 'gemini', apiKey: GEMINI_KEY } },
      CONTROL_TOKEN,
    );
    expect(set.status).toBe(204);
    expect(store().get()).toEqual({ provider: 'gemini', apiKey: GEMINI_KEY });

    expect((await put({ credentials: null }, CONTROL_TOKEN)).status).toBe(204);
    expect(store().get()).toBeNull();
  });

  it('rejects the interface token, browser contexts and path variants', async () => {
    await start();
    const body = { credentials: { provider: 'gemini', apiKey: GEMINI_KEY } };

    expect((await put(body, TEST_TOKEN)).status).toBe(401);
    expect((await put(body, CONTROL_TOKEN, { Origin: 'app://careerly' })).status).toBe(403);
    expect((await put(body, TEST_TOKEN, {}, '/INTERNAL/ai-credentials')).status).toBe(401);
    expect(store().get()).toBeNull();
  });

  it('is disabled when no control token is configured', async () => {
    await start({});
    const response = await put({ credentials: null }, TEST_TOKEN);
    expect(response.status).toBe(403);
  });

  it('is write-only: there is no route that returns the key', async () => {
    await start();
    await put({ credentials: { provider: 'gemini', apiKey: GEMINI_KEY } }, CONTROL_TOKEN);
    const response = await fetch(`http://127.0.0.1:${server!.port}/internal/ai-credentials`, {
      headers: { Authorization: `Bearer ${CONTROL_TOKEN}` },
    });
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain(GEMINI_KEY);
  });

  it('validates the body without echoing the key', async () => {
    await start();
    const badKey = 'AIza with spaces 0123456789';
    const response = await put(
      { credentials: { provider: 'gemini', apiKey: badKey } },
      CONTROL_TOKEN,
    );
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('with spaces');

    const unknownProvider = await put(
      { credentials: { provider: 'other', apiKey: GEMINI_KEY } },
      CONTROL_TOKEN,
    );
    expect(unknownProvider.status).toBe(400);
    expect(await unknownProvider.text()).not.toContain(GEMINI_KEY);
  });

  it('never writes the key to the logs (RNF-03)', async () => {
    await start();
    await put({ credentials: { provider: 'gemini', apiKey: GEMINI_KEY } }, CONTROL_TOKEN);
    await put(
      { credentials: { provider: 'gemini', apiKey: `${GEMINI_KEY} broken` } },
      CONTROL_TOKEN,
    );
    await put({ credentials: null }, CONTROL_TOKEN);

    const output = logs.output();
    expect(output).toContain('AI credentials updated (provider: gemini)');
    expect(output).toContain('AI credentials cleared');
    expect(output).not.toContain(GEMINI_KEY);
  });
});
