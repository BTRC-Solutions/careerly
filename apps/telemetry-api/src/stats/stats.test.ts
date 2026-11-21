import { type TelemetryMetricsV1, TelemetryStatsSchema } from '@careerly/contracts';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { installs, reports } from '../database/schema.js';
import { createTestDb, startTestApp, TEST_SECRET, TestClock } from '../test-support/test-app.js';
import { INTERNAL_SECRET_HEADER } from './stats.controller.js';

/*
 * `GET /internal/stats` (roadmap 8.5, RN-20): aggregates where each value, and each title, appears only when at
 * least 5 distinct installations reported it; excluded installations do not count.
 */

const DAY = '2026-11-18';

describe('telemetry stats (integration)', () => {
  let database: Awaited<ReturnType<typeof createTestDb>>;
  let app: Awaited<ReturnType<typeof startTestApp>> | undefined;

  beforeAll(async () => {
    database = await createTestDb();
  });
  afterAll(async () => {
    await database.close();
  });
  beforeEach(async () => {
    await database.reset();
    app = await startTestApp(database.db, {
      clock: new TestClock(new Date('2026-11-20T12:00:00.000Z')),
    });
  });
  afterEach(async () => {
    await app?.close();
  });

  /** Installations with one report each on `DAY`, written straight to the tables. */
  async function seed(entries: { metrics: TelemetryMetricsV1; excluded?: boolean }[]) {
    for (const entry of entries) {
      const installId = crypto.randomUUID();
      await database.db.insert(installs).values({
        installId,
        publicKey: 'k'.repeat(43),
        registeredOn: DAY,
        excluded: entry.excluded ?? false,
      });
      await database.db.insert(reports).values({
        installId,
        day: DAY,
        schemaVersion: 1,
        appVersion: '0.8.0',
        metrics: entry.metrics,
      });
    }
  }

  const get = (query = '', secret: string | null = TEST_SECRET) =>
    fetch(app!.url(`/internal/stats${query}`), {
      headers: secret === null ? {} : { [INTERNAL_SECRET_HEADER]: secret },
    });

  it('needs the secret shared with stats-web', async () => {
    expect((await get('', null)).status).toBe(401);
    expect((await get('', 'wrong')).status).toBe(401);
    expect((await get('')).status).toBe(200);
  });

  it('shows each value only when at least 5 installations reported it (RN-20)', async () => {
    const backend = (title: string, alsoIndeed = false): TelemetryMetricsV1 => ({
      activeUsage: { active: true },
      applications: { created: 2 },
      sources: alsoIndeed ? { 'linkedin.com': 1, 'indeed.com': 1 } : { 'linkedin.com': 1 },
      positionTitles: [title],
      countries: { AR: 1 },
      features: {
        resumesGenerated: 1,
        outputLanguages: { es: 1 },
        gapsAnswered: 2,
        aiTokens: 1000,
      },
    });
    await seed([
      // Five installations with LinkedIn and the same title written differently.
      { metrics: backend('Senior Backend Engineer', true) },
      { metrics: backend('senior backend engineer', true) },
      { metrics: backend('Senior  Backend Engineer') },
      { metrics: backend(' SENIOR BACKEND ENGINEER') },
      { metrics: backend('Senior Backend Engineer') },
      // Indeed in two more (four in all) and Spain in three; a unique title from one person.
      { metrics: { sources: { 'indeed.com': 1 }, countries: { ES: 1 } } },
      { metrics: { sources: { 'indeed.com': 1 }, countries: { ES: 1 } } },
      { metrics: { countries: { ES: 1 }, positionTitles: ['Head of Llama Grooming'] } },
      // An excluded installation does not count, not even to reach the threshold.
      { metrics: { countries: { ES: 1 }, sources: { 'indeed.com': 1 } }, excluded: true },
    ]);

    const response = await get(`?from=${DAY}&to=${DAY}`);
    const stats = TelemetryStatsSchema.parse(await response.json());

    expect(stats.activeInstalls).toBe(5);
    expect(stats.activeByDay).toEqual([{ day: DAY, installs: 5 }]);
    expect(stats.applicationsByWeek).toEqual([{ week: '2026-11-16', created: 10 }]);
    // Indeed: four valid installations plus the excluded one, below the threshold.
    expect(stats.sources).toEqual({ 'linkedin.com': 5 });
    expect(stats.countries).toEqual({ AR: 5 });
    expect(stats.positionTitles).toEqual([{ title: ' SENIOR BACKEND ENGINEER', installs: 5 }]);
    expect(JSON.stringify(stats)).not.toContain('Llama');
    expect(stats.outputLanguages).toEqual({ es: 5 });
    expect(stats.features).toEqual({
      installs: 5,
      resumesGenerated: 5,
      gapsAnswered: 10,
      medianDailyAiTokens: 1000,
    });
  });

  it('hides the counts that fewer than 5 installations are behind', async () => {
    await seed([
      { metrics: { activeUsage: { active: true }, applications: { created: 3 } } },
      { metrics: { activeUsage: { active: true } } },
    ]);
    const stats = TelemetryStatsSchema.parse(await (await get(`?from=${DAY}&to=${DAY}`)).json());

    expect(stats.activeInstalls).toBeNull();
    expect(stats.activeByDay).toEqual([{ day: DAY, installs: null }]);
    expect(stats.applicationsByWeek).toEqual([{ week: '2026-11-16', created: null }]);
    expect(stats.features.installs).toBeNull();
  });

  it('defaults to the last 30 days and refuses a period that makes no sense', async () => {
    const stats = TelemetryStatsSchema.parse(await (await get()).json());
    expect([stats.from, stats.to]).toEqual(['2026-10-22', '2026-11-20']);
    expect((await get('?from=2026-11-20&to=2026-11-01')).status).toBe(400);
    expect((await get('?from=2024-01-01&to=2026-11-01')).status).toBe(400);
    expect((await get('?from=yesterday')).status).toBe(400);
  });

  it('answers /health with nothing but the status', async () => {
    const response = await fetch(app!.url('/health'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
