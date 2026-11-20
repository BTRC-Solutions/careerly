import 'reflect-metadata';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TELEMETRY_POW_HEADER,
  TELEMETRY_SIGNATURE_HEADER,
  type TelemetryMetricsV1,
  type TelemetryReportV1,
  telemetryPowChallenge,
} from '@careerly/contracts';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { pino } from 'pino';
import type { TelemetryApiConfig } from '../config.js';
import type { TelemetryDb } from '../database/database.js';
import * as schema from '../database/schema.js';
import { leadingZeroBits } from '../ingest/crypto.js';
import { type RunningServer, startServer } from '../server.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export const TEST_SECRET = 'internal-secret-shared-with-stats-web-0123456789';

/** Postgres in memory (PGlite, WASM) with the real migrations: the same on Windows and Ubuntu, without Docker. */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(here, '..', '..', 'drizzle') });
  return {
    db: db as unknown as TelemetryDb,
    client,
    reset: () => client.exec('TRUNCATE reports, sends, installs'),
    close: () => client.close(),
  };
}

export function testConfig(overrides: Partial<TelemetryApiConfig> = {}): TelemetryApiConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    databaseUrl: 'pglite://memory',
    internalSecret: TEST_SECRET,
    // Low, so the tests solve it at once; the real one takes ~1–2 s.
    powDifficulty: 8,
    requestsPerHourPerIp: 20,
    newInstallsPerHour: 50,
    trustProxyHops: 1,
    ...overrides,
  };
}

/** A clock the tests move by hand. */
export class TestClock {
  constructor(public current: Date) {}
  readonly now = () => this.current;
  set(iso: string) {
    this.current = new Date(iso);
  }
}

/** A debug logger that keeps every line, to assert what is (not) logged. */
export function capturingLogger() {
  const lines: string[] = [];
  const logger = pino({ level: 'trace' }, { write: (line: string) => lines.push(line) });
  return { logger, output: () => lines.join('') };
}

export async function startTestApp(
  db: TelemetryDb,
  options: { clock: TestClock; config?: Partial<TelemetryApiConfig> },
) {
  const logs = capturingLogger();
  const server: RunningServer = await startServer({
    config: testConfig(options.config),
    db,
    logger: logs.logger,
    now: options.clock.now,
  });
  const url = (route: string) => `http://127.0.0.1:${server.port}${route}`;
  return { server, logs, url, close: () => server.close() };
}

/** An installation of the app: its id and Ed25519 key pair, as the app creates them on accepting. */
export function newInstallation(installId = crypto.randomUUID()) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'jwk' }).x!;
  return {
    installId,
    publicKey: raw,
    sign: (body: string) => sign(null, Buffer.from(body), privateKey).toString('base64'),
  };
}
export type TestInstallation = ReturnType<typeof newInstallation>;

/** Finds the nonce of a proof of work, as the app does on its first request. */
export function solvePow(
  installId: string,
  publicKey: string,
  utcDay: string,
  difficulty: number,
): string {
  for (let nonce = 0; ; nonce++) {
    const challenge = telemetryPowChallenge(installId, publicKey, utcDay, String(nonce));
    if (leadingZeroBits(createHash('sha256').update(challenge).digest()) >= difficulty) {
      return String(nonce);
    }
  }
}

export const ACTIVE: TelemetryMetricsV1 = { activeUsage: { active: true } };

export function report(
  installation: TestInstallation,
  day: string,
  metrics: TelemetryMetricsV1 = ACTIVE,
): TelemetryReportV1 {
  return { schemaVersion: 1, installId: installation.installId, day, appVersion: '0.8.0', metrics };
}

/** Sends a signed batch the way the app does; each option breaks one thing on purpose. */
export async function send(
  url: (route: string) => string,
  installation: TestInstallation,
  reports: TelemetryReportV1[],
  options: {
    utcDay: string;
    withKey?: boolean;
    /** The nonce; by default solved for `utcDay` with the test difficulty, `null` to leave it out. */
    pow?: string | null;
    ip?: string;
    signature?: string;
    body?: string;
    contentType?: string;
    batch?: Record<string, unknown>;
  },
) {
  const body =
    options.body ??
    JSON.stringify({
      schemaVersion: 1,
      installId: installation.installId,
      sentAt: new Date().toISOString(),
      ...(options.withKey ? { publicKey: installation.publicKey } : {}),
      reports,
      ...options.batch,
    });
  const pow =
    options.pow === undefined
      ? solvePow(installation.installId, installation.publicKey, options.utcDay, 8)
      : options.pow;
  const response = await fetch(url('/v1/reports'), {
    method: 'POST',
    headers: {
      'Content-Type': options.contentType ?? 'application/json',
      'X-Forwarded-For': options.ip ?? '203.0.113.7',
      [TELEMETRY_SIGNATURE_HEADER]: options.signature ?? installation.sign(body),
      ...(pow === null ? {} : { [TELEMETRY_POW_HEADER]: pow }),
    },
    body,
  });
  return {
    status: response.status,
    retryAfter: response.headers.get('retry-after'),
    body: (await response.json()) as unknown,
  };
}
