import {
  RegenerateInstallIdResponseSchema,
  TelemetryPreviewResponseSchema,
  TelemetryReportsResponseSchema,
  TelemetrySettingsResponseSchema,
} from '@careerly/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../platform/database/sqlite.js';
import { createTempDir } from '../../test-support/temp-dir.js';
import {
  type RunningServer,
  startTestServer,
  TEST_TOKEN,
  testConfig,
} from '../../test-support/test-server.js';

type Method = 'GET' | 'POST' | 'PATCH';

describe('telemetry API (integration)', () => {
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

  async function call(method: Method, url: string, body?: unknown) {
    const response = await fetch(`http://127.0.0.1:${server!.port}${url}`, {
      method,
      headers: { Authorization: `Bearer ${TEST_TOKEN}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as unknown };
  }

  const settings = async () =>
    TelemetrySettingsResponseSchema.parse((await call('GET', '/telemetry/settings')).body);

  /** Reads the raw tables, to prove what is (not) stored. */
  function rows(sql: string) {
    const db = openDatabase(config().databaseFile);
    try {
      return db.prepare(sql).all();
    } finally {
      db.close();
    }
  }

  beforeEach(async () => {
    temp = createTempDir();
    await start();
  });
  afterEach(async () => {
    await stop();
    temp.cleanup();
  });

  it('starts pending: the window must be shown, nothing is enabled and there is no id', async () => {
    const initial = await settings();
    expect(initial).toMatchObject({
      status: 'PENDING',
      consentVersion: 0,
      promptRequired: true,
      installId: null,
    });
    expect(initial.metrics.every((metric) => !metric.enabled && metric.isNew)).toBe(true);
    expect(initial.metrics).toHaveLength(8);

    expect((await call('GET', '/telemetry/preview')).body).toEqual({ report: null });
    expect(rows('SELECT * FROM telemetry_activity_days')).toEqual([]);
  });

  it('"Rechazar todo" stores the answer but no id, activity or report', async () => {
    const rejected = TelemetrySettingsResponseSchema.parse(
      (await call('PATCH', '/telemetry/settings', { decision: 'REJECT' })).body,
    );
    expect(rejected).toMatchObject({ status: 'REJECTED', promptRequired: false, installId: null });

    // Use the app, then restart (reports are built at startup).
    await call('GET', '/profile');
    await stop();
    await start();
    expect(rows('SELECT * FROM telemetry_activity_days')).toEqual([]);
    expect(rows('SELECT * FROM telemetry_reports')).toEqual([]);
    expect(rows(`SELECT key FROM settings WHERE key = 'telemetry.installId'`)).toEqual([]);
    expect((await call('POST', '/telemetry/install-id/regenerate')).status).toBe(409);
  });

  it('accepting creates the id, records today and previews the exact JSON', async () => {
    const accepted = TelemetrySettingsResponseSchema.parse(
      (
        await call('PATCH', '/telemetry/settings', {
          decision: 'ACCEPT',
          metrics: { positionTitles: false },
        })
      ).body,
    );
    expect(accepted.status).toBe('ACCEPTED');
    expect(accepted.installId).not.toBeNull();
    expect(accepted.metrics.find((metric) => metric.id === 'positionTitles')?.enabled).toBe(false);
    expect(accepted.metrics.filter((metric) => metric.enabled)).toHaveLength(7);

    const { report } = TelemetryPreviewResponseSchema.parse(
      (await call('GET', '/telemetry/preview')).body,
    );
    expect(report).toEqual({
      schemaVersion: 1,
      installId: accepted.installId,
      day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      appVersion: '0.0.0-dev',
      metrics: { activeUsage: { active: true } },
    });
    expect(rows('SELECT day FROM telemetry_activity_days')).toEqual([{ day: report!.day }]);

    // The answer persists across restarts.
    await stop();
    await start();
    expect(await settings()).toEqual(accepted);
  });

  it('builds PENDING reports of past days with use at startup, without sending them', async () => {
    await call('PATCH', '/telemetry/settings', { decision: 'ACCEPT' });
    const db = openDatabase(config().databaseFile);
    db.prepare('INSERT INTO telemetry_activity_days (day) VALUES (?), (?)').run(
      '2000-01-01', // older than 30 days: never built
      new Date(Date.now() - 2 * 86_400_000).toLocaleDateString('sv-SE'),
    );
    db.close();
    await stop();
    await start();

    const { reports } = TelemetryReportsResponseSchema.parse(
      (await call('GET', '/telemetry/reports')).body,
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ status: 'PENDING', attempts: 0, sentAt: null });
    expect(reports[0]!.payload.metrics).toEqual({ activeUsage: { active: true } });
  });

  it('regenerates the anonymous id', async () => {
    const { installId } = await (async () =>
      TelemetrySettingsResponseSchema.parse(
        (await call('PATCH', '/telemetry/settings', { decision: 'ACCEPT' })).body,
      ))();
    const regenerated = await call('POST', '/telemetry/install-id/regenerate');
    expect(regenerated.status).toBe(200);
    const next = RegenerateInstallIdResponseSchema.parse(regenerated.body).installId;
    expect(next).not.toBe(installId);
    expect((await settings()).installId).toBe(next);
  });

  it.each([
    [{}],
    [{ decision: 'MAYBE' }],
    [{ decision: 'REJECT', metrics: { funnel: true } }],
    [{ metrics: { resume: true } }],
  ])('rejects the invalid body %j', async (body) => {
    expect((await call('PATCH', '/telemetry/settings', body)).status).toBe(400);
  });
});
