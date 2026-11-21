import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { TelemetryStats } from '@careerly/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStatsServer } from './stats-server.js';

/*
 * stats-web's server (roadmap 8.6, ADR-18): it serves the page and only `/api/stats` and `/health`, asks
 * telemetry-api with the shared secret over the internal network, caches, and never exposes the receiver.
 */

const SECRET = 'internal-secret-shared-with-stats-web-0123456789';

const STATS: TelemetryStats = {
  from: '2026-10-22',
  to: '2026-11-20',
  activeInstalls: 12,
  activeByDay: [],
  activeByWeek: [{ week: '2026-11-16', installs: 12 }],
  applicationsByWeek: [{ week: '2026-11-16', created: 40 }],
  sources: { 'linkedin.com': 30 },
  positionCategories: {},
  funnel: {},
  workMode: {},
  countries: { AR: 20 },
  outputLanguages: {},
  positionTitles: [{ title: 'Backend Engineer', installs: 6 }],
  features: { installs: 8, resumesGenerated: 25, gapsAnswered: 60, medianDailyAiTokens: 9000 },
};

/** A fake telemetry-api that records what it is asked. */
async function fakeReceiver() {
  const requests: { url: string; secret: string | undefined }[] = [];
  let healthy = true;
  const server = http.createServer((request, response) => {
    requests.push({
      url: request.url ?? '',
      secret: request.headers['x-internal-secret'] as string | undefined,
    });
    if (request.url === '/health') {
      response.writeHead(healthy ? 200 : 503).end();
      return;
    }
    const ok = request.headers['x-internal-secret'] === SECRET;
    response.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(ok ? STATS : { error: { code: 'UNAUTHORIZED' } }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    setHealthy: (value: boolean) => (healthy = value),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('stats-web server', () => {
  let receiver: Awaited<ReturnType<typeof fakeReceiver>>;
  let server: http.Server;
  let base: string;
  let now: Date;
  let staticDir: string;

  beforeEach(async () => {
    receiver = await fakeReceiver();
    now = new Date('2026-11-20T12:00:00.000Z');
    staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-web-'));
    fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>Careerly</title>');
    server = createStatsServer({
      telemetryUrl: receiver.url,
      internalSecret: SECRET,
      staticDir,
      cacheMs: 5 * 60 * 1000,
      now: () => now,
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await receiver.close();
    fs.rmSync(staticDir, { recursive: true, force: true });
  });

  it('asks telemetry-api with the secret, and never gives the secret to the browser', async () => {
    const response = await fetch(`${base}/api/stats?range=30`);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual(STATS);
    expect(text).not.toContain(SECRET);
    expect(receiver.requests).toEqual([
      { url: '/internal/stats?from=2026-10-22&to=2026-11-20', secret: SECRET },
    ]);
  });

  it('keeps each answer a few minutes', async () => {
    await fetch(`${base}/api/stats?range=90`);
    await fetch(`${base}/api/stats?range=90`);
    expect(receiver.requests).toHaveLength(1);
    now = new Date(now.getTime() + 5 * 60 * 1000);
    await fetch(`${base}/api/stats?range=90`);
    expect(receiver.requests).toHaveLength(2);
    expect(receiver.requests[1]!.url).toBe('/internal/stats?from=2026-08-23&to=2026-11-20');
  });

  it('offers only its own routes: no other period, no receiver route, no writes', async () => {
    expect((await fetch(`${base}/api/stats?range=7`)).status).toBe(400);
    expect((await fetch(`${base}/api/internal/stats`)).status).toBe(404);
    expect((await fetch(`${base}/api/stats`, { method: 'POST' })).status).toBe(405);
    // `/internal/...` is just a page path here: the page, never the receiver.
    const internal = await fetch(`${base}/internal/stats`);
    expect(await internal.text()).toContain('<title>Careerly</title>');
    expect(receiver.requests).toHaveLength(0);
  });

  it('serves the page for any other path, and nothing outside its folder', async () => {
    const page = await fetch(`${base}/`);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(page.headers.get('content-security-policy')).toContain("default-src 'self'");
    const escape = await fetch(`${base}/..%2f..%2fetc%2fpasswd`);
    expect(await escape.text()).toContain('<title>Careerly</title>');
  });

  it('answers 502 when telemetry-api fails, and /health follows it', async () => {
    await receiver.close();
    expect((await fetch(`${base}/api/stats?range=365`)).status).toBe(502);
    expect((await fetch(`${base}/health`)).status).toBe(503);
  });

  it('is healthy when telemetry-api is', async () => {
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
