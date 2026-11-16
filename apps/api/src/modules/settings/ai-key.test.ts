import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import {
  type AiCredentials,
  SettingsResponseSchema,
  VerifyAiKeyResponseSchema,
} from '@careerly/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLogger } from '../../platform/logging/logger.js';
import { createTempDir } from '../../test-support/temp-dir.js';
import {
  type RunningServer,
  startTestServer,
  TEST_TOKEN as TOKEN,
  testConfig,
} from '../../test-support/test-server.js';

const CONTROL_TOKEN = 'control-token-for-the-tests';

const ANTHROPIC = {
  valid: 'sk-ant-valid-key-0123456789',
  revoked: 'sk-ant-revoked-key-0123456789',
  rateLimited: 'sk-ant-rate-limited-0123456789',
  providerError: 'sk-ant-provider-error-0123456789',
};
const GEMINI = {
  valid: 'AIzaSy-gemini-valid-0123456789',
  invalid: 'AIzaSy-gemini-invalid-0123456789',
  restricted: 'AIzaSy-gemini-restricted-0123456789',
  rateLimited: 'AIzaSy-gemini-rate-limited-0123456789',
  badRequest: 'AIzaSy-gemini-other-400-0123456789',
};

/** Minimal stand-in for Anthropic's `GET /v1/models` and Gemini's `GET /v1beta/models`. */
function startFakeProviders() {
  const received: { path: string | undefined; version?: string }[] = [];
  const server = http.createServer((request, response) => {
    const reply = (status: number, body: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };

    if (request.url?.startsWith('/v1beta/models')) {
      received.push({ path: request.url });
      const key = request.headers['x-goog-api-key'];
      if (key === GEMINI.valid) return reply(200, { models: [] });
      if (key === GEMINI.rateLimited) return reply(429, { error: { code: 429 } });
      if (key === GEMINI.restricted) return reply(403, { error: { code: 403 } });
      if (key === GEMINI.badRequest)
        return reply(400, { error: { status: 'FAILED_PRECONDITION' } });
      // What Google really answers for a wrong key: 400, not 401.
      return reply(400, {
        error: {
          code: 400,
          message: 'API key not valid. Please pass a valid API key.',
          status: 'INVALID_ARGUMENT',
          details: [{ reason: 'API_KEY_INVALID' }],
        },
      });
    }

    received.push({ path: request.url, version: request.headers['anthropic-version'] as string });
    const key = request.headers['x-api-key'];
    const status =
      key === ANTHROPIC.valid
        ? 200
        : key === ANTHROPIC.rateLimited
          ? 429
          : key === ANTHROPIC.providerError
            ? 529
            : 401;
    reply(status, status === 200 ? { data: [] } : { type: 'error' });
  });
  return new Promise<{ url: string; received: typeof received; close(): Promise<void> }>(
    (resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as AddressInfo;
        resolve({
          url: `http://127.0.0.1:${port}`,
          received,
          close: () => new Promise((done) => server.close(() => done())),
        });
      });
    },
  );
}

describe('AI key verification (integration)', () => {
  let temp: ReturnType<typeof createTempDir>;
  let providers: Awaited<ReturnType<typeof startFakeProviders>>;
  let server: RunningServer | undefined;

  const config = (baseUrl = providers.url) =>
    testConfig(temp.dir, {
      CAREERLY_CONTROL_TOKEN: CONTROL_TOKEN,
      CAREERLY_GEMINI_BASE_URL: baseUrl,
      CAREERLY_ANTHROPIC_BASE_URL: baseUrl,
    });

  /** Plays Electron's main process: sends the active key to the backend's memory. */
  async function setActiveKey(credentials: AiCredentials['credentials']) {
    const response = await fetch(`http://127.0.0.1:${server!.port}/internal/ai-credentials`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${CONTROL_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials }),
    });
    expect(response.status).toBe(204);
  }

  function verify(body?: unknown) {
    return fetch(`http://127.0.0.1:${server!.port}/settings/ai-key/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function verified(body?: unknown) {
    const response = await verify(body);
    expect(response.status).toBe(200);
    return VerifyAiKeyResponseSchema.parse(await response.json());
  }

  async function aiKeySettings() {
    const response = await fetch(`http://127.0.0.1:${server!.port}/settings`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    return SettingsResponseSchema.parse(await response.json()).aiKey;
  }

  beforeEach(async () => {
    temp = createTempDir();
    providers = await startFakeProviders();
    server = await startTestServer(config());
  });

  afterEach(async () => {
    await server?.close();
    server = undefined;
    await providers.close();
    temp.cleanup();
  });

  it('reports NOT_CONFIGURED when there is no key, and GET /settings says so', async () => {
    expect(await verified()).toEqual({ status: 'NOT_CONFIGURED', provider: null });
    expect(await verified({})).toEqual({ status: 'NOT_CONFIGURED', provider: null });
    expect(providers.received).toHaveLength(0);
    expect(await aiKeySettings()).toEqual({ configured: false, provider: null });
  });

  it('verifies the active key in memory against its provider, without restarting', async () => {
    await setActiveKey({ provider: 'gemini', apiKey: GEMINI.valid });
    expect(await verified()).toEqual({ status: 'VALID', provider: 'gemini' });
    expect(await aiKeySettings()).toEqual({ configured: true, provider: 'gemini' });

    await setActiveKey({ provider: 'anthropic', apiKey: ANTHROPIC.revoked });
    expect(await verified()).toEqual({ status: 'INVALID', provider: 'anthropic' });

    expect(providers.received).toEqual([
      { path: '/v1beta/models?pageSize=1' },
      { path: '/v1/models?limit=1', version: '2023-06-01' },
    ]);
  });

  it('verifies a candidate key from the body without storing it', async () => {
    expect(await verified({ provider: 'gemini', apiKey: GEMINI.valid })).toMatchObject({
      status: 'VALID',
    });
    expect(await verified({ provider: 'anthropic', apiKey: ANTHROPIC.valid })).toMatchObject({
      status: 'VALID',
    });
    expect(await aiKeySettings()).toEqual({ configured: false, provider: null });
  });

  it('maps Gemini answers: 400 API_KEY_INVALID and 403 are INVALID, 429 is VALID', async () => {
    const status = async (apiKey: string) =>
      (await verified({ provider: 'gemini', apiKey })).status;
    expect(await status(GEMINI.invalid)).toBe('INVALID');
    expect(await status(GEMINI.restricted)).toBe('INVALID');
    expect(await status(GEMINI.rateLimited)).toBe('VALID');
    // A 400 that is not about the key does not blame the key.
    expect(await status(GEMINI.badRequest)).toBe('UNREACHABLE');
  });

  it('maps Anthropic answers: 429 is VALID, provider errors are UNREACHABLE', async () => {
    const status = async (apiKey: string) =>
      (await verified({ provider: 'anthropic', apiKey })).status;
    expect(await status(ANTHROPIC.rateLimited)).toBe('VALID');
    expect(await status(ANTHROPIC.providerError)).toBe('UNREACHABLE');
  });

  it('reports UNREACHABLE when the provider cannot be reached', async () => {
    await server!.close();
    const offline = providers.url;
    await providers.close();
    providers = await startFakeProviders();
    server = await startTestServer(config(offline));

    expect((await verified({ provider: 'gemini', apiKey: GEMINI.valid })).status).toBe(
      'UNREACHABLE',
    );
  });

  it('rejects malformed bodies without echoing the key', async () => {
    for (const body of [
      { provider: 'gemini', apiKey: 'AIzaSy secret' },
      { provider: 'gemini', apiKey: '' },
      { apiKey: GEMINI.valid },
      { provider: 'other', apiKey: GEMINI.valid },
      { key: GEMINI.valid },
    ]) {
      const response = await verify(body);
      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toContain('VALIDATION_FAILED');
      expect(text).not.toContain('secret');
      expect(text).not.toContain(GEMINI.valid);
    }
  });

  it('never writes a key to the database, logs or any other file', async () => {
    await server!.close();
    const realConfig = config();
    const logger = createLogger({ ...realConfig, logLevel: 'trace' });
    server = await startTestServer(realConfig, logger);

    await setActiveKey({ provider: 'gemini', apiKey: GEMINI.valid });
    await verified();
    await verified({ provider: 'gemini', apiKey: GEMINI.invalid });
    await verified({ provider: 'anthropic', apiKey: ANTHROPIC.revoked });
    await verify({ provider: 'gemini', apiKey: `${GEMINI.valid} x` });
    await server.close();
    server = undefined;
    logger.flush();
    await new Promise((resolve) => setTimeout(resolve, 200));

    const files = fs.readdirSync(temp.dir, { recursive: true, withFileTypes: true });
    const contents = files
      .filter((entry) => entry.isFile())
      .map((entry) => fs.readFileSync(path.join(entry.parentPath, entry.name)).toString('latin1'));
    expect(contents.length).toBeGreaterThan(0);
    expect(contents.some((text) => text.includes('AI key verification'))).toBe(true);
    expect(contents.some((text) => text.includes('AI credentials updated'))).toBe(true);
    for (const text of contents) {
      expect(text).not.toContain('sk-ant-');
      expect(text).not.toContain('AIzaSy-gemini');
    }
  });
});
