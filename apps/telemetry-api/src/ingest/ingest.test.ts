import { createHash } from 'node:crypto';
import { telemetryPowChallenge } from '@careerly/contracts';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestDb,
  newInstallation,
  report,
  send,
  startTestApp,
  TestClock,
} from '../test-support/test-app.js';
import { leadingZeroBits } from './crypto.js';
import { addDays } from './days.js';

/*
 * `POST /v1/reports` end to end against Postgres (PGlite), roadmap 8.5 (RF-TEL-09, RN-20, RNF-22, RNF-23, ADR-26):
 * signed requests, the proof of work of a new installation, one successful request per UTC day, the plausibility
 * ranges and the limits per IP.
 */

const TODAY = '2026-11-20';

describe('telemetry ingest (integration)', () => {
  let database: Awaited<ReturnType<typeof createTestDb>>;
  let app: Awaited<ReturnType<typeof startTestApp>> | undefined;
  let clock: TestClock;

  beforeAll(async () => {
    database = await createTestDb();
  });
  afterAll(async () => {
    await database.close();
  });
  beforeEach(async () => {
    await database.reset();
    clock = new TestClock(new Date(`${TODAY}T15:00:00.000Z`));
  });
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  const start = async (config = {}) => {
    app = await startTestApp(database.db, { clock, config });
    return app;
  };
  const utcDay = () => clock.current.toISOString().slice(0, 10);
  const post = (...args: Parameters<typeof send> extends [unknown, ...infer Rest] ? Rest : never) =>
    send(app!.url, ...args);
  const count = async (table: 'reports' | 'installs' | 'sends') =>
    (await database.client.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0]!
      .n;

  it('registers a new installation and keeps the 30 days it saved before its first request', async () => {
    await start();
    const install = newInstallation();
    const days = Array.from({ length: 31 }, (_, i) => addDays(TODAY, -i));

    const first = await post(
      install,
      days.map((day) => report(install, day)),
      { utcDay: utcDay(), withKey: true },
    );

    expect(first.status).toBe(202);
    expect(first.body).toEqual({ accepted: days, duplicates: [] });
    const installs = await database.client.query('SELECT registered_on::text AS on FROM installs');
    expect(installs.rows).toEqual([{ on: TODAY }]);
    expect(await count('reports')).toBe(31);
  });

  it('takes one successful request per installation and UTC day, and the first report of a day wins', async () => {
    await start();
    const install = newInstallation();
    const yesterday = addDays(TODAY, -1);
    await post(install, [report(install, yesterday, { applications: { created: 1 } })], {
      utcDay: utcDay(),
      withKey: true,
    });

    // Again the same UTC day: 409, and nothing is written.
    const again = await post(install, [report(install, TODAY)], { utcDay: utcDay() });
    expect(again).toMatchObject({ status: 409, body: { error: { code: 'ALREADY_SENT_TODAY' } } });
    expect(await count('reports')).toBe(1);

    // The next UTC day: the new day is stored and the repeated one is ignored.
    clock.set(`${addDays(TODAY, 1)}T09:00:00.000Z`);
    const next = await post(
      install,
      [report(install, yesterday, { applications: { created: 9 } }), report(install, TODAY)],
      { utcDay: utcDay() },
    );
    expect(next).toMatchObject({
      status: 202,
      body: { accepted: [TODAY], duplicates: [yesterday] },
    });
    const kept = await database.client.query<{ metrics: unknown }>(
      `SELECT metrics FROM reports WHERE day = '${yesterday}'`,
    );
    expect(kept.rows[0]!.metrics).toEqual({ applications: { created: 1 } });
  });

  it('rejects a signature that does not match the installation (401)', async () => {
    await start();
    const install = newInstallation();
    await post(install, [report(install, TODAY)], { utcDay: utcDay(), withKey: true });
    clock.set(`${addDays(TODAY, 1)}T09:00:00.000Z`);

    // The body changed after signing.
    const tampered = await post(install, [report(install, TODAY)], {
      utcDay: utcDay(),
      signature: install.sign('something else'),
    });
    expect(tampered).toMatchObject({ status: 401, body: { error: { code: 'INVALID_SIGNATURE' } } });

    // Someone else, with its own key, on behalf of a known installation.
    const impostor = newInstallation(install.installId);
    expect((await post(impostor, [report(impostor, TODAY)], { utcDay: utcDay() })).status).toBe(
      401,
    );
    expect(
      (await post(impostor, [report(impostor, TODAY)], { utcDay: utcDay(), withKey: true })).status,
    ).toBe(401);

    // A new installation without its key cannot be checked.
    const keyless = newInstallation();
    expect((await post(keyless, [report(keyless, TODAY)], { utcDay: utcDay() })).status).toBe(401);
    expect(await count('reports')).toBe(1);
  });

  it('asks a new installation for the proof of work, with the difficulty (428)', async () => {
    await start();
    const install = newInstallation();
    const missing = await post(install, [report(install, TODAY)], {
      utcDay: utcDay(),
      withKey: true,
      pow: null,
    });
    expect(missing).toMatchObject({
      status: 428,
      body: { error: { code: 'PROOF_OF_WORK_REQUIRED', difficulty: 8 } },
    });

    let wrong = 0;
    const hash = (nonce: number) =>
      createHash('sha256')
        .update(telemetryPowChallenge(install.installId, install.publicKey, TODAY, String(nonce)))
        .digest();
    while (leadingZeroBits(hash(wrong)) >= 8) wrong++;
    const insufficient = await post(install, [report(install, TODAY)], {
      utcDay: utcDay(),
      withKey: true,
      pow: String(wrong),
    });
    expect(insufficient.status).toBe(428);
    expect(await count('installs')).toBe(0);
  });

  it('rejects the whole batch when one value is out of range, and an extra field (400)', async () => {
    await start();
    const install = newInstallation();
    const outOfRange = await post(
      install,
      [
        report(install, addDays(TODAY, -1)),
        report(install, TODAY, { applications: { created: 101 } }),
      ],
      { utcDay: utcDay(), withKey: true },
    );
    expect(outOfRange).toMatchObject({ status: 400, body: { error: { code: 'INVALID_REPORT' } } });

    const extraMetric = await post(
      install,
      [report(install, TODAY, { activeUsage: { active: true }, email: 'me@example.com' } as never)],
      { utcDay: utcDay(), withKey: true },
    );
    expect(extraMetric.status).toBe(400);
    const extraField = await post(install, [report(install, TODAY)], {
      utcDay: utcDay(),
      withKey: true,
      batch: { ip: '203.0.113.7' },
    });
    expect(extraField.status).toBe(400);

    // Nothing written, not even the installation.
    expect(await count('reports')).toBe(0);
    expect(await count('installs')).toBe(0);
  });

  it('accepts days up to the next UTC day and none outside the window', async () => {
    // Late in the UTC day: east of UTC it is already tomorrow.
    clock.set(`${TODAY}T23:30:00.000Z`);
    await start();
    const ahead = newInstallation();
    expect(
      (await post(ahead, [report(ahead, addDays(TODAY, 1))], { utcDay: utcDay(), withKey: true }))
        .status,
    ).toBe(202);

    for (const day of [addDays(TODAY, 2), addDays(TODAY, -31)]) {
      const other = newInstallation();
      const response = await post(other, [report(other, day)], {
        utcDay: utcDay(),
        withKey: true,
        ip: `198.51.100.${day.slice(-2)}`,
      });
      expect(response.status, day).toBe(400);
    }
  });

  it('checks the shape first: JSON only, and at most 16 KB (415, 413)', async () => {
    await start();
    const install = newInstallation();
    const text = await post(install, [report(install, TODAY)], {
      utcDay: utcDay(),
      withKey: true,
      contentType: 'text/plain',
    });
    expect(text.status).toBe(415);

    const big = await post(install, [], { utcDay: utcDay(), body: 'x'.repeat(16 * 1024 + 1) });
    expect(big).toMatchObject({ status: 413, body: { error: { code: 'PAYLOAD_TOO_LARGE' } } });

    const notJson = await post(install, [], { utcDay: utcDay(), body: '{not json' });
    expect(notJson.status).toBe(400);
  });

  it('limits the requests of one IP per hour (429 with Retry-After)', async () => {
    await start({ requestsPerHourPerIp: 3 });
    const install = newInstallation();
    for (let i = 0; i < 3; i++) {
      await post(install, [], { utcDay: utcDay(), body: '{}', ip: '203.0.113.9' });
    }
    const limited = await post(install, [], { utcDay: utcDay(), body: '{}', ip: '203.0.113.9' });
    expect(limited.status).toBe(429);
    expect(Number(limited.retryAfter)).toBeGreaterThan(0);
    // Another IP is not affected.
    const other = await post(install, [], { utcDay: utcDay(), body: '{}', ip: '203.0.113.10' });
    expect(other.status).toBe(400);
  });

  it('registers one new installation per IP and UTC day, and caps them per hour', async () => {
    await start({ newInstallsPerHour: 2 });
    const [a, b, c] = [newInstallation(), newInstallation(), newInstallation()];
    const ip = '192.0.2.1';
    expect(
      (await post(a, [report(a, TODAY)], { utcDay: utcDay(), withKey: true, ip })).status,
    ).toBe(202);
    // A second installation from the same IP waits for the next day.
    const sameIp = await post(b, [report(b, TODAY)], { utcDay: utcDay(), withKey: true, ip });
    expect(sameIp.status).toBe(429);
    expect(Number(sameIp.retryAfter)).toBeGreaterThan(0);
    // From another IP it goes in, until the hourly cap across all IPs.
    expect(
      (await post(b, [report(b, TODAY)], { utcDay: utcDay(), withKey: true, ip: '192.0.2.2' }))
        .status,
    ).toBe(202);
    expect(
      (await post(c, [report(c, TODAY)], { utcDay: utcDay(), withKey: true, ip: '192.0.2.3' }))
        .status,
    ).toBe(429);
    expect(app!.logs.output()).toContain('new-installs-per-hour');

    // The next day, the first IP can register again.
    clock.set(`${addDays(TODAY, 1)}T16:00:00.000Z`);
    expect(
      (await post(c, [report(c, TODAY)], { utcDay: utcDay(), withKey: true, ip })).status,
    ).toBe(202);
  });

  it('answers 410 to a report format that is no longer accepted', async () => {
    await start();
    const install = newInstallation();
    const old = await post(install, [], {
      utcDay: utcDay(),
      body: JSON.stringify({ schemaVersion: 0, installId: install.installId, reports: [] }),
    });
    expect(old).toMatchObject({ status: 410, body: { error: { code: 'SCHEMA_VERSION_GONE' } } });
  });

  it('logs results and reasons, never IPs or the content of the reports (RNF-23)', async () => {
    await start();
    const install = newInstallation();
    const metrics = {
      positionTitles: ['Staff Platform Engineer'],
      sources: { 'linkedin.com': 1 },
    };
    await post(install, [report(install, TODAY, metrics)], {
      utcDay: utcDay(),
      withKey: true,
      ip: '203.0.113.77',
    });
    await post(install, [report(install, TODAY, { applications: { created: 500 } })], {
      utcDay: utcDay(),
      ip: '203.0.113.77',
    });

    const output = app!.logs.output();
    expect(output).toContain('Reports received.');
    expect(output).toContain(install.installId.slice(0, 8));
    for (const secret of [
      '203.0.113.77',
      'Staff Platform Engineer',
      install.publicKey,
      install.installId,
    ]) {
      expect(output, secret).not.toContain(secret);
    }
  });
});
