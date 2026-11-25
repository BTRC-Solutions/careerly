import { createPublicKey, verify } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  TELEMETRY_POW_HEADER,
  TELEMETRY_SIGNATURE_HEADER,
  type TelemetryBatchV1,
  TelemetryReportsResponseSchema,
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

const CONTROL_TOKEN = 'control-token-only-main-knows';
const SECRET = Buffer.alloc(32, 3).toString('base64url');

interface Received {
  batch: TelemetryBatchV1;
  signed: boolean;
  pow: string | undefined;
}

/**
 * A receiver that, like the real one, asks a new installation for the proof of work and checks the signature
 * over the exact body bytes.
 */
async function startReceiver() {
  const received: Received[] = [];
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks);
      const batch = JSON.parse(body.toString('utf8')) as TelemetryBatchV1;
      const publicKey = batch.publicKey ?? received.find((r) => r.batch.publicKey)?.batch.publicKey;
      const signed =
        publicKey !== undefined &&
        verify(
          null,
          body,
          createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: publicKey }, format: 'jwk' }),
          Buffer.from(String(request.headers[TELEMETRY_SIGNATURE_HEADER]), 'base64'),
        );
      const pow = request.headers[TELEMETRY_POW_HEADER] as string | undefined;
      received.push({ batch, signed, pow });
      response.writeHead(batch.publicKey && !pow ? 428 : 202, {
        'Content-Type': 'application/json',
      });
      response.end(
        JSON.stringify(
          batch.publicKey && !pow
            ? { error: { code: 'PROOF_OF_WORK_REQUIRED', difficulty: 4 } }
            : { accepted: batch.reports.map((report) => report.day), duplicates: [] },
        ),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    received,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function waitFor<T>(check: () => Promise<T | undefined | false>, timeoutMs = 8000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for a condition.');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('sending the telemetry (integration)', () => {
  let temp: ReturnType<typeof createTempDir>;
  let receiver: Awaited<ReturnType<typeof startReceiver>>;
  let server: RunningServer | undefined;

  beforeEach(async () => {
    temp = createTempDir();
    receiver = await startReceiver();
    server = await startTestServer(
      testConfig(temp.dir, {
        CAREERLY_CONTROL_TOKEN: CONTROL_TOKEN,
        CAREERLY_TELEMETRY_URL: receiver.url,
      }),
    );
  });
  afterEach(async () => {
    await server?.close();
    await receiver.close();
    temp.cleanup();
  });

  const call = (method: string, url: string, body: unknown, token = TEST_TOKEN) =>
    fetch(`http://127.0.0.1:${server!.port}${url}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('sends yesterday once main hands over the secret, signed and with the proof of work', async () => {
    expect((await call('PATCH', '/telemetry/settings', { decision: 'ACCEPT' })).status).toBe(200);
    // The app was used yesterday (local day): there is a closed day to report.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('sv-SE');
    const db = openDatabase(testConfig(temp.dir).databaseFile);
    db.prepare('INSERT INTO telemetry_activity_days (day) VALUES (?)').run(yesterday);
    db.close();

    // Only main can hand the secret over; without it nothing leaves.
    expect(
      (await call('PUT', '/internal/telemetry-secret', { secret: SECRET })).status,
    ).toBeGreaterThanOrEqual(401);
    expect(receiver.received).toEqual([]);
    expect(
      (await call('PUT', '/internal/telemetry-secret', { secret: SECRET }, CONTROL_TOKEN)).status,
    ).toBe(204);

    const reports = await waitFor(async () => {
      const response = await call('GET', '/telemetry/reports', undefined);
      const { reports } = TelemetryReportsResponseSchema.parse(await response.json());
      return reports.length > 0 && reports.every((report) => report.status === 'SENT')
        ? reports
        : false;
    });

    expect(reports.map((report) => report.day)).toEqual([yesterday]);
    const [first, second] = receiver.received;
    expect(first).toMatchObject({ signed: true, pow: undefined });
    expect(second).toMatchObject({ signed: true, pow: expect.any(String) });
    expect(second!.batch.reports).toEqual(reports.map((report) => report.payload));
    expect(receiver.received).toHaveLength(2);
  });
});
