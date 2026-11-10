import { SettingsResponseSchema } from '@careerly/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../platform/database/sqlite.js';
import { createTempDir } from '../../test-support/temp-dir.js';
import {
  type RunningServer,
  startTestServer,
  TEST_TOKEN as TOKEN,
  testConfig,
} from '../../test-support/test-server.js';

describe('settings API (integration)', () => {
  let temp: ReturnType<typeof createTempDir>;
  let server: RunningServer | undefined;

  const config = () => testConfig(temp.dir);

  async function start() {
    server = await startTestServer(config());
  }

  async function stop() {
    await server?.close();
    server = undefined;
  }

  function request(method: 'GET' | 'PATCH', body?: unknown) {
    return fetch(`http://127.0.0.1:${server!.port}/settings`, {
      method,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  beforeEach(async () => {
    temp = createTempDir();
    await start();
  });

  afterEach(async () => {
    await stop();
    temp.cleanup();
  });

  it('GET returns the defaults and the data folder', async () => {
    const response = await request('GET');
    expect(response.status).toBe(200);
    expect(SettingsResponseSchema.parse(await response.json())).toEqual({
      preferences: { uiLanguage: null },
      dataDir: config().dataDir,
    });
  });

  it('PATCH persists the language across restarts', async () => {
    const patched = await request('PATCH', { uiLanguage: 'en' });
    expect(patched.status).toBe(200);
    expect(SettingsResponseSchema.parse(await patched.json()).preferences.uiLanguage).toBe('en');

    await stop();
    await start();

    const after = SettingsResponseSchema.parse(await (await request('GET')).json());
    expect(after.preferences.uiLanguage).toBe('en');

    // Updating again overwrites the stored value, and null resets it.
    await request('PATCH', { uiLanguage: 'es' });
    await request('PATCH', { uiLanguage: null });
    const reset = SettingsResponseSchema.parse(await (await request('GET')).json());
    expect(reset.preferences.uiLanguage).toBeNull();
  });

  it.each([
    ['an unsupported language', { uiLanguage: 'fr' }],
    ['an unknown key', { dataDir: 'C:/elsewhere' }],
    ['an empty patch', {}],
    ['a non-object body', ['en']],
  ])('PATCH rejects %s without changing anything', async (_case, body) => {
    const response = await request('PATCH', body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });

    const after = SettingsResponseSchema.parse(await (await request('GET')).json());
    expect(after.preferences.uiLanguage).toBeNull();
  });

  it('falls back to the default when a stored value is invalid', async () => {
    const db = openDatabase(config().databaseFile);
    db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      'ui.language',
      '"klingon"',
      new Date().toISOString(),
    );
    db.close();

    const response = SettingsResponseSchema.parse(await (await request('GET')).json());
    expect(response.preferences.uiLanguage).toBeNull();
  });
});
