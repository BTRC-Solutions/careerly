import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { type TelemetryStats, TelemetryStatsSchema } from '@careerly/contracts';

/** The periods the page offers, in days. Nothing else reaches the receiver. */
export const STATS_RANGES = [30, 90, 365] as const;
export type StatsRange = (typeof STATS_RANGES)[number];

export interface StatsServerOptions {
  /** `telemetry-api` on the internal Docker network, e.g. `http://telemetry-api:3000`. */
  telemetryUrl: string;
  /** Shared with `telemetry-api`; never sent to the browser. */
  internalSecret: string;
  /** The built page (`dist/client`); `null` serves only the API (tests, development with Vite). */
  staticDir: string | null;
  cacheMs: number;
  now?: () => Date;
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; frame-ancestors 'none'",
};

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
};

/**
 * The page's own small server (ARCHITECTURE §19.5, ADR-18): it serves the built page and exposes only
 * `GET /api/stats?range=` and `GET /health`. It asks `telemetry-api` for the aggregates over the internal
 * network with the shared secret and keeps each answer a few minutes. The browser never talks to the receiver,
 * and nothing here adds to or recalculates what the receiver already filtered by the anonymity threshold.
 */
export function createStatsServer(options: StatsServerOptions): http.Server {
  const now = options.now ?? (() => new Date());
  const cache = new Map<StatsRange, { at: number; stats: TelemetryStats }>();

  async function stats(range: StatsRange): Promise<TelemetryStats> {
    const cached = cache.get(range);
    if (cached && now().getTime() - cached.at < options.cacheMs) return cached.stats;
    const to = now().toISOString().slice(0, 10);
    const fromDate = new Date(`${to}T00:00:00.000Z`);
    fromDate.setUTCDate(fromDate.getUTCDate() - (range - 1));
    const from = fromDate.toISOString().slice(0, 10);
    const response = await fetch(`${options.telemetryUrl}/internal/stats?from=${from}&to=${to}`, {
      headers: { 'x-internal-secret': options.internalSecret },
    });
    if (!response.ok) throw new Error(`telemetry-api answered ${response.status}`);
    const fresh = TelemetryStatsSchema.parse(await response.json());
    cache.set(range, { at: now().getTime(), stats: fresh });
    return fresh;
  }

  async function healthy(): Promise<boolean> {
    try {
      return (await fetch(`${options.telemetryUrl}/health`)).ok;
    } catch {
      return false;
    }
  }

  return http.createServer((request, response) => {
    void handle(request, response).catch(() => {
      if (!response.headersSent) json(response, 500, { error: 'Unexpected error.' });
    });
  });

  async function handle(request: http.IncomingMessage, response: http.ServerResponse) {
    const url = new URL(request.url ?? '/', 'http://stats.local');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json(response, 405, { error: 'Method not allowed.' });
    }

    if (url.pathname === '/health') {
      const ok = await healthy();
      return json(response, ok ? 200 : 503, { status: ok ? 'ok' : 'unavailable' });
    }

    if (url.pathname === '/api/stats') {
      const range = Number(url.searchParams.get('range') ?? 30);
      if (!STATS_RANGES.includes(range as StatsRange)) {
        return json(response, 400, { error: 'Unknown range.' });
      }
      try {
        const body = await stats(range as StatsRange);
        return json(response, 200, body, { 'Cache-Control': 'public, max-age=300' });
      } catch {
        return json(response, 502, { error: 'The statistics are not available right now.' });
      }
    }
    if (url.pathname.startsWith('/api/')) return json(response, 404, { error: 'Not found.' });

    return serveStatic(url.pathname, response);
  }

  function serveStatic(pathname: string, response: http.ServerResponse) {
    if (!options.staticDir) return json(response, 404, { error: 'Not found.' });
    const root = path.resolve(options.staticDir);
    const requested = path.resolve(root, `.${decodeURIComponent(pathname)}`);
    // Never outside the built page; anything that is not a file is the page itself.
    const inside = requested.startsWith(root + path.sep);
    const file =
      inside && fs.existsSync(requested) && fs.statSync(requested).isFile()
        ? requested
        : path.join(root, 'index.html');
    const type = MIME[path.extname(file)] ?? 'application/octet-stream';
    const immutable = file.includes(`${path.sep}assets${path.sep}`);
    response.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': type,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    fs.createReadStream(file).pipe(response);
  }
}

function json(
  response: http.ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json',
    ...headers,
  });
  response.end(JSON.stringify(body));
}
