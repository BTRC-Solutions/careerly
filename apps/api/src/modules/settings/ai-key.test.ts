import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { SettingsResponseSchema, VerifyAiKeyResponseSchema } from '@careerly/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLogger } from '../../platform/logging/logger.js';
import { AiKeyStore } from '../../platform/secrets/ai-key-store.js';
import { createTempDir } from '../../test-support/temp-dir.js';
import {
  type RunningServer,
  startTestServer,
  TEST_TOKEN as TOKEN,
  testConfig,
} from '../../test-support/test-server.js';

const VALID_KEY = 'sk-ant-valid-key-0123456789';
const REVOKED_KEY = 'sk-ant-revoked-key-0123456789';
const RATE_LIMITED_KEY = 'sk-ant-rate-limited-0123456789';
const BROKEN_PROVIDER_KEY = 'sk-ant-provider-error-0123456789';

/** Minimal stand-in for Anthropic's `GET /v1/models`, answering by key. */
function startFakeProvider() {
  const received: { path: string | undefined; version: string | undefined }[] = [];
  const server = http.createServer((request, response) => {
    received.push({ path: request.url, version: request.headers['anthropic-version'] as string });
    const key = request.headers['x-api-key'];
    const status =
      key === VALID_KEY
        ? 200
        : key === RATE_LIMITED_KEY
          ? 429
          : key === BROKEN_PROVIDER_KEY
            ? 529
            : 401;
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(status === 200 ? '{"data":[]}' : '{"type":"error"}');
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
  let provider: Awaited<ReturnType<typeof startFakeProvider>>;
  let server: RunningServer | undefined;
  let store: AiKeyStore;

  const config = (aiBaseUrl = provider.url) =>
    testConfig(temp.dir, { CAREERLY_AI_BASE_URL: aiBaseUrl });

  function verify(body?: unknown) {
    return fetch(`http://127.0.0.1:${server!.port}/settings/ai-key/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function verifiedStatus(body?: unknown) {
    const response = await verify(body);
    expect(response.status).toBe(200);
    return VerifyAiKeyResponseSchema.parse(await response.json()).status;
  }

  beforeEach(async () => {
    temp = createTempDir();
    provider = await startFakeProvider();
    store = new AiKeyStore();
    server = await startTestServer(config(), { aiKeyStore: store });
  });

  afterEach(async () => {
    await server?.close();
    server = undefined;
    await provider.close();
    temp.cleanup();
  });

  it('reports NOT_CONFIGURED when there is no key, and GET /settings says so', async () => {
    expect(await verifiedStatus()).toBe('NOT_CONFIGURED');
    expect(await verifiedStatus({})).toBe('NOT_CONFIGURED');
    expect(provider.received).toHaveLength(0);

    const settings = await fetch(`http://127.0.0.1:${server!.port}/settings`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(SettingsResponseSchema.parse(await settings.json()).aiKey).toEqual({
      configured: false,
    });
  });

  it('verifies the key held in memory, picking up changes without restarting', async () => {
    store.set(VALID_KEY);
    expect(await verifiedStatus()).toBe('VALID');

    store.set(REVOKED_KEY);
    expect(await verifiedStatus()).toBe('INVALID');

    expect(provider.received).toEqual([
      { path: '/v1/models?limit=1', version: '2023-06-01' },
      { path: '/v1/models?limit=1', version: '2023-06-01' },
    ]);
  });

  it('verifies a candidate key from the body without storing it', async () => {
    expect(await verifiedStatus({ apiKey: VALID_KEY })).toBe('VALID');
    expect(await verifiedStatus({ apiKey: 'sk-ant-wrong' })).toBe('INVALID');
    expect(store.isConfigured()).toBe(false);
  });

  it('treats a rate-limited key as valid and provider errors as UNREACHABLE', async () => {
    expect(await verifiedStatus({ apiKey: RATE_LIMITED_KEY })).toBe('VALID');
    expect(await verifiedStatus({ apiKey: BROKEN_PROVIDER_KEY })).toBe('UNREACHABLE');
  });

  it('reports UNREACHABLE when the provider cannot be reached', async () => {
    await server!.close();
    const offline = provider.url;
    await provider.close();
    provider = await startFakeProvider();
    server = await startTestServer(config(offline), { aiKeyStore: store });

    expect(await verifiedStatus({ apiKey: VALID_KEY })).toBe('UNREACHABLE');
  });

  it('rejects malformed bodies without echoing the key', async () => {
    for (const body of [{ apiKey: 'sk-ant secret' }, { apiKey: '' }, { key: VALID_KEY }]) {
      const response = await verify(body);
      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toContain('VALIDATION_FAILED');
      expect(text).not.toContain('secret');
      expect(text).not.toContain(VALID_KEY);
    }
  });

  it('never writes the key to the database, logs or any other file', async () => {
    await server!.close();
    const realConfig = config();
    const logger = createLogger({ ...realConfig, logLevel: 'trace' });
    server = await startTestServer(realConfig, { aiKeyStore: store, logger });

    store.set(VALID_KEY);
    await verifiedStatus();
    await verifiedStatus({ apiKey: REVOKED_KEY });
    await verify({ apiKey: `${VALID_KEY} x` });
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
    for (const text of contents) {
      expect(text).not.toContain('sk-ant-');
    }
  });
});
