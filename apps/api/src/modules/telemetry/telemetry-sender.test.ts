import { createHash, createPublicKey, verify } from 'node:crypto';
import {
  TELEMETRY_POW_HEADER,
  TELEMETRY_SIGNATURE_HEADER,
  type TelemetryBatchV1,
  type TelemetryMetricId,
  TelemetryMetricIdSchema,
  type TelemetryMetricsV1,
  telemetryPowChallenge,
} from '@careerly/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { TelemetrySecretStore } from './application/telemetry-secret.store.js';
import { TelemetrySender, TelemetrySendRetryableError } from './application/telemetry-sender.js';
import {
  type ReceiverAnswer,
  type StoredTelemetryReport,
  TelemetryActivityRepository,
  TelemetryCollector,
  TelemetryEnvironment,
  TelemetryPreferencesStore,
  TelemetryReportRepository,
  TelemetryTransport,
} from './application/telemetry.ports.js';
import { TelemetryService } from './application/telemetry.service.js';
import { NO_PREFERENCES, type TelemetryPreferences } from './domain/telemetry-consent.js';
import { sendRetryDelayMs } from './domain/telemetry-sending.js';
import { HashcashProofOfWork } from './infrastructure/hashcash-proof-of-work.js';
import { HmacTelemetryKeys } from './infrastructure/hmac-telemetry-keys.js';

const URL = 'https://receiver.test';
const SECRET = Buffer.alloc(32, 7).toString('base64url');
const OTHER_SECRET = Buffer.alloc(32, 9).toString('base64url');

interface SentRequest {
  url: string;
  body: string;
  headers: Record<string, string>;
}

/** Answers each request with the next answer of the list, or throws when the item is an error. */
class FakeTransport extends TelemetryTransport {
  requests: SentRequest[] = [];
  answers: (Partial<ReceiverAnswer> | Error)[] = [];
  async post(url: string, body: string, headers: Record<string, string>) {
    this.requests.push({ url, body, headers });
    const next = this.answers.shift() ?? { status: 202 };
    if (next instanceof Error) throw next;
    return { status: 202, retryAfterSeconds: null, difficulty: null, ...next };
  }
}

class MemoryTelemetryPreferences extends TelemetryPreferencesStore {
  prefs: TelemetryPreferences = NO_PREFERENCES;
  async load() {
    return this.prefs;
  }
  async save(prefs: TelemetryPreferences) {
    this.prefs = prefs;
  }
}

class MemoryTelemetryReports extends TelemetryReportRepository {
  rows: StoredTelemetryReport[] = [];
  async existingDays(days: string[]) {
    return new Set(this.rows.map((row) => row.day).filter((day) => days.includes(day)));
  }
  async insert(report: StoredTelemetryReport) {
    this.rows.push(report);
  }
  async list() {
    return [...this.rows].sort((a, b) => b.day.localeCompare(a.day));
  }
  async deleteUnsent() {
    this.rows = this.rows.filter((row) => row.status === 'SENT');
  }
  async pending() {
    return this.rows
      .filter((row) => row.status === 'PENDING')
      .sort((a, b) => a.day.localeCompare(b.day));
  }
  async countAttempt(days: string[]) {
    this.update(days, (row) => ({ ...row, attempts: row.attempts + 1 }));
  }
  async markSent(days: string[], sentAt: string) {
    this.update(days, (row) => ({ ...row, status: 'SENT', sentAt }));
  }
  async markFailed(days: string[]) {
    this.update(days, (row) => ({ ...row, status: 'FAILED' }));
  }
  private update(days: string[], change: (row: StoredTelemetryReport) => StoredTelemetryReport) {
    this.rows = this.rows.map((row) => (days.includes(row.day) ? change(row) : row));
  }
}

class MemoryTelemetryActivity extends TelemetryActivityRepository {
  days = new Set<string>();
  async record(day: string) {
    this.days.add(day);
  }
  async daysBetween(from: string, to: string) {
    return [...this.days].filter((day) => day >= from && day <= to).sort();
  }
  async has(day: string) {
    return this.days.has(day);
  }
}

class FakeTelemetryEnvironment extends TelemetryEnvironment {
  readonly appVersion = '0.1.0';
  receiverUrl: string | null = URL;
  current = new Date(2026, 10, 16, 10, 0);
  private ids = 0;
  now() {
    return this.current;
  }
  newInstallId() {
    this.ids++;
    return `00000000-0000-4000-8000-${String(this.ids).padStart(12, '0')}`;
  }
}

class FakeCollector extends TelemetryCollector {
  constructor(
    readonly metric: TelemetryMetricId,
    private readonly produce: (day: string) => TelemetryMetricsV1,
  ) {
    super();
  }
  async collect(day: string) {
    return this.produce(day);
  }
}

const batchOf = (request: SentRequest) => JSON.parse(request.body) as TelemetryBatchV1;

/** What the receiver checks (apps/telemetry-api/src/ingest/crypto.ts). */
function isValidSignature(request: SentRequest, publicKey: string) {
  const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: publicKey }, format: 'jwk' });
  return verify(
    null,
    Buffer.from(request.body),
    key,
    Buffer.from(request.headers[TELEMETRY_SIGNATURE_HEADER]!, 'base64'),
  );
}

function zeroBits(text: string) {
  const hash = createHash('sha256').update(text).digest();
  let bits = 0;
  for (const byte of hash) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

describe('TelemetrySender', () => {
  let preferences: MemoryTelemetryPreferences;
  let reports: MemoryTelemetryReports;
  let activity: MemoryTelemetryActivity;
  let environment: FakeTelemetryEnvironment;
  let secrets: TelemetrySecretStore;
  let transport: FakeTransport;
  let service: TelemetryService;
  let sender: TelemetrySender;

  beforeEach(async () => {
    preferences = new MemoryTelemetryPreferences();
    reports = new MemoryTelemetryReports();
    activity = new MemoryTelemetryActivity();
    environment = new FakeTelemetryEnvironment();
    secrets = new TelemetrySecretStore();
    secrets.set(SECRET);
    transport = new FakeTransport();
    service = new TelemetryService(preferences, reports, activity, environment, [
      new FakeCollector('activeUsage', (day) =>
        activity.days.has(day) ? { activeUsage: { active: true } } : {},
      ),
    ]);
    sender = new TelemetrySender(
      preferences,
      reports,
      new HmacTelemetryKeys(secrets),
      transport,
      new HashcashProofOfWork(),
      environment,
      service,
    );

    // Accepted on Nov 14; used on Nov 14 and 15; today is Nov 16.
    environment.current = new Date('2026-11-14T12:00:00Z');
    await service.updateSettings({ decision: 'ACCEPT', metrics: {} });
    environment.current = new Date('2026-11-15T12:00:00Z');
    await service.recordActivity();
    environment.current = new Date('2026-11-16T12:00:00Z');
    await service.buildPendingReports();
  });

  const installId = () => preferences.prefs.installId!;
  const keyOf = (id: string) => new HmacTelemetryKeys(secrets).forInstallation(id)!.publicKey;

  it('sends every pending report in one signed batch, with the key and the proof of work the first time', async () => {
    expect((await reports.pending()).map((report) => report.day)).toEqual([
      '2026-11-14',
      '2026-11-15',
    ]);
    transport.answers = [{ status: 428, difficulty: 8 }, { status: 202 }];

    expect(await sender.send()).toBe('SENT');

    const [first, second] = transport.requests;
    expect(first!.url).toBe(`${URL}/v1/reports`);
    expect(first!.headers['Content-Type']).toBe('application/json');
    const batch = batchOf(first!);
    expect(batch).toMatchObject({ schemaVersion: 1, installId: installId() });
    expect(batch.publicKey).toBe(keyOf(installId()));
    expect(batch.reports.map((report) => report.day)).toEqual(['2026-11-14', '2026-11-15']);
    expect(isValidSignature(first!, batch.publicKey!)).toBe(true);
    expect(first!.headers[TELEMETRY_POW_HEADER]).toBeUndefined();

    // Same body after the 428, with a nonce that reaches the difficulty for the receiver's day.
    expect(second!.body).toBe(first!.body);
    const nonce = second!.headers[TELEMETRY_POW_HEADER]!;
    expect(
      zeroBits(telemetryPowChallenge(installId(), batch.publicKey!, '2026-11-16', nonce)),
    ).toBeGreaterThanOrEqual(8);

    // What was signed is what stays stored and shown in Privacy.
    const stored = await reports.list();
    expect(stored.map((report) => [report.day, report.status, report.attempts])).toEqual([
      ['2026-11-15', 'SENT', 1],
      ['2026-11-14', 'SENT', 1],
    ]);
    expect(stored.map((report) => report.payload).reverse()).toEqual(batch.reports);
    expect(preferences.prefs).toMatchObject({
      registeredKey: batch.publicKey,
      lastSentDay: '2026-11-16',
    });
  });

  it('sends once per UTC day, and without the key once the receiver knows it', async () => {
    await sender.send();
    expect(await sender.send()).toBe('ALREADY_SENT_TODAY');
    expect(transport.requests).toHaveLength(1);

    environment.current = new Date('2026-11-17T09:00:00Z');
    await service.recordActivity();
    environment.current = new Date('2026-11-18T09:00:00Z');
    await service.buildPendingReports();
    expect(await sender.send()).toBe('SENT');

    const batch = batchOf(transport.requests[1]!);
    expect(batch.publicKey).toBeUndefined();
    expect(batch.reports.map((report) => report.day)).toEqual(['2026-11-17']);
    expect(isValidSignature(transport.requests[1]!, keyOf(installId()))).toBe(true);
  });

  it('takes a 409 as sent: the receiver already has today', async () => {
    transport.answers = [{ status: 409 }];
    expect(await sender.send()).toBe('ALREADY_SENT_TODAY');
    expect((await reports.pending()).length).toBe(0);
    expect(preferences.prefs.lastSentDay).toBe('2026-11-16');
  });

  it('keeps the reports for a retry without network, with a 429 or a 5xx', async () => {
    transport.answers = [new TypeError('fetch failed')];
    await expect(sender.send()).rejects.toMatchObject({ code: 'NETWORK', retryAfterSeconds: null });

    transport.answers = [{ status: 503, retryAfterSeconds: 120 }];
    const error = await sender.send().catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(TelemetrySendRetryableError);
    expect(error).toMatchObject({ code: 'HTTP_503', retryAfterSeconds: 120 });

    expect((await reports.pending()).map((report) => report.attempts)).toEqual([2, 2]);
    expect(preferences.prefs.lastSentDay).toBeNull();
    expect(await sender.send()).toBe('SENT');
  });

  it('does not send the same body again when the receiver rejects it', async () => {
    transport.answers = [{ status: 400 }];
    expect(await sender.send()).toBe('REJECTED');
    expect((await reports.list()).map((report) => report.status)).toEqual(['FAILED', 'FAILED']);
    expect(await sender.send()).toBe('NOTHING_TO_SEND');
    expect(transport.requests).toHaveLength(1);
  });

  it('starts a new installation from tomorrow when the receiver turns the key down (401)', async () => {
    const oldId = installId();
    transport.answers = [{ status: 401 }];

    expect(await sender.send()).toBe('NEW_INSTALLATION');

    expect(installId()).not.toBe(oldId);
    expect(preferences.prefs).toMatchObject({ registeredKey: null, lastSentDay: '2026-11-16' });
    // The unsent reports are rebuilt with the new id.
    expect((await reports.pending()).map((report) => report.payload.installId)).toEqual([
      installId(),
      installId(),
    ]);
    expect(await sender.send()).toBe('ALREADY_SENT_TODAY');

    environment.current = new Date('2026-11-17T09:00:00Z');
    expect(await sender.send()).toBe('SENT');
    const batch = batchOf(transport.requests[1]!);
    expect(batch.installId).toBe(installId());
    expect(batch.publicKey).toBe(keyOf(installId()));
    expect(batch.publicKey).not.toBe(keyOf(oldId));
  });

  it('never reuses an id with another key: a new secret means a new installation', async () => {
    await sender.send();
    const oldId = installId();
    secrets.set(OTHER_SECRET);
    environment.current = new Date('2026-11-17T09:00:00Z');
    await service.recordActivity();
    environment.current = new Date('2026-11-18T09:00:00Z');
    await service.buildPendingReports();

    expect(await sender.send()).toBe('NEW_INSTALLATION');
    expect(transport.requests).toHaveLength(1);
    expect(installId()).not.toBe(oldId);

    expect(await sender.send()).toBe('SENT');
    const batch = batchOf(transport.requests[1]!);
    expect(batch).toMatchObject({ installId: installId(), publicKey: keyOf(installId()) });
    expect(batch.reports.map((report) => report.day)).toEqual(['2026-11-17']);
  });

  it('sends nothing without consent, a receiver or the secret', async () => {
    secrets.set(null);
    expect(await sender.canSend()).toBe(false);
    expect(await sender.send()).toBe('OFF');

    secrets.set(SECRET);
    environment.receiverUrl = null;
    expect(await sender.send()).toBe('OFF');

    environment.receiverUrl = URL;
    const allOff = Object.fromEntries(TelemetryMetricIdSchema.options.map((id) => [id, false]));
    await service.updateSettings({ metrics: allOff });
    expect(await sender.send()).toBe('OFF');
    expect(transport.requests).toHaveLength(0);
  });

  it('waits about 1 min, 5 min, 30 min and 2 h, never less than Retry-After', () => {
    const middle = () => 0.5;
    expect([1, 2, 3, 4].map((attempt) => sendRetryDelayMs(attempt, null, middle))).toEqual([
      60_000, 300_000, 1_800_000, 7_200_000,
    ]);
    expect(sendRetryDelayMs(1, null, () => 0)).toBe(48_000);
    expect(sendRetryDelayMs(1, null, () => 1)).toBe(72_000);
    expect(sendRetryDelayMs(1, 600, middle)).toBe(600_000);
  });
});
