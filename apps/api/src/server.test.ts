import 'reflect-metadata';
import http from 'node:http';
import { HealthResponseSchema } from '@careerly/contracts';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from './platform/config/app-config.js';
import { startServer, type RunningServer } from './server.js';
import { createTempDir, MIGRATIONS_DIR } from './test-support/temp-dir.js';

const TOKEN = 'integration-test-token';

describe('local API (integration)', () => {
  let temp: ReturnType<typeof createTempDir>;
  let server: RunningServer;
  let baseUrl: string;

  beforeEach(async () => {
    temp = createTempDir();
    const config = loadConfig(
      {
        CAREERLY_DATA_DIR: temp.dir,
        CAREERLY_API_TOKEN: TOKEN,
        CAREERLY_ALLOWED_ORIGINS: 'app://careerly',
      },
      { defaultMigrationsDir: MIGRATIONS_DIR },
    );
    server = await startServer(config, pino({ level: 'silent' }));
    baseUrl = `http://127.0.0.1:${server.port}`;
  });

  afterEach(async () => {
    await server.close();
    temp.cleanup();
  });

  it('GET /health reports the migrated database', async () => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { Authorization: `Bearer ${TOKEN}`, Origin: 'app://careerly' },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('app://careerly');
    const body = HealthResponseSchema.parse(await response.json());
    expect(body.database.appliedMigrations).toBe(1);
  });

  it('rejects requests without the token', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token.' },
    });
  });

  it('rejects other websites', async () => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { Authorization: `Bearer ${TOKEN}`, Origin: 'https://evil.example' },
    });
    expect(response.status).toBe(403);
  });

  it('rejects a foreign Host header (DNS rebinding)', async () => {
    const status = await new Promise<number | undefined>((resolve, reject) => {
      http
        .get(
          `${baseUrl}/health`,
          { headers: { Host: `evil.example:${server.port}`, Authorization: `Bearer ${TOKEN}` } },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        )
        .on('error', reject);
    });
    expect(status).toBe(403);
  });

  it('returns errors in the shared shape', async () => {
    const response = await fetch(`${baseUrl}/does-not-exist`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});
