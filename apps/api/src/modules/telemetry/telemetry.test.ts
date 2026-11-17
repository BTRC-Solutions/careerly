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

  /** Tokens of the `ai_generations` rows created on a local day, straight from the table. */
  function sumTokensOn(day: string): number {
    return (
      rows('SELECT input_tokens, output_tokens, created_at FROM ai_generations') as {
        input_tokens: number;
        output_tokens: number;
        created_at: string;
      }[]
    )
      .filter((row) => new Date(row.created_at).toLocaleDateString('sv-SE') === day)
      .reduce((total, row) => total + row.input_tokens + row.output_tokens, 0);
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

  it('reports the AI tokens of each day, as recorded in AiGeneration (RF-TEL-03h)', async () => {
    await call('PATCH', '/telemetry/settings', { decision: 'ACCEPT' });
    const now = new Date();
    const at = (daysAgo: number, hour: number) =>
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour).toISOString();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const db = openDatabase(config().databaseFile);
    const insert = db.prepare(
      `INSERT INTO ai_generations (id, task, provider, model, prompt_version, attempt, status,
         input_tokens, output_tokens, cost_usd, latency_ms, error_code, created_at)
       VALUES (?, ?, 'gemini', 'gemini-test', 'v1', 1, ?, ?, ?, 0, 100, NULL, ?)`,
    );
    insert.run('t1', 'jd-analysis', 'SUCCEEDED', 1200, 300, now.toISOString());
    insert.run('t2', 'cv-import', 'INVALID_OUTPUT', 800, 100, now.toISOString());
    insert.run('y1', 'jd-analysis', 'SUCCEEDED', 2000, 500, at(1, 0));
    insert.run('y2', 'achievement-suggestion', 'SUCCEEDED', 100, 50, at(1, 23));
    insert.run('o1', 'cv-import', 'SUCCEEDED', 9999, 9999, at(2, 12));
    db.prepare('INSERT INTO telemetry_activity_days (day) VALUES (?)').run(
      yesterday.toLocaleDateString('sv-SE'),
    );
    db.close();

    // Today, so far: the preview adds both of today's attempts, failed ones included.
    const { report } = TelemetryPreviewResponseSchema.parse(
      (await call('GET', '/telemetry/preview')).body,
    );
    expect(report!.metrics.features).toEqual({
      resumesGenerated: 0,
      outputLanguages: {},
      gapsAnswered: 0,
      aiTokens: 1200 + 300 + 800 + 100,
    });
    expect(report!.metrics.features!.aiTokens).toBe(sumTokensOn(report!.day));

    // Yesterday, once closed: its own attempts, from its first to its last hour.
    await stop();
    await start();
    const { reports } = TelemetryReportsResponseSchema.parse(
      (await call('GET', '/telemetry/reports')).body,
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]!.payload.metrics.features?.aiTokens).toBe(2000 + 500 + 100 + 50);
    expect(reports[0]!.payload.metrics.features!.aiTokens).toBe(sumTokensOn(reports[0]!.day));
  });

  it('leaves the metric out on days without AI use, and when it is disabled', async () => {
    await call('PATCH', '/telemetry/settings', {
      decision: 'ACCEPT',
      metrics: { features: false },
    });
    const db = openDatabase(config().databaseFile);
    db.prepare(
      `INSERT INTO ai_generations (id, task, provider, model, prompt_version, attempt, status,
         input_tokens, output_tokens, cost_usd, latency_ms, error_code, created_at)
       VALUES ('t1', 'jd-analysis', 'gemini', 'm', 'v1', 1, 'SUCCEEDED', 10, 10, 0, 1, NULL, ?)`,
    ).run(new Date().toISOString());
    db.close();
    const preview = async () =>
      TelemetryPreviewResponseSchema.parse((await call('GET', '/telemetry/preview')).body).report!
        .metrics;
    expect(await preview()).toEqual({ activeUsage: { active: true } });

    await call('PATCH', '/telemetry/settings', { metrics: { features: true } });
    expect((await preview()).features?.aiTokens).toBe(20);
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
