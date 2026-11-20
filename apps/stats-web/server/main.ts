import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStatsServer } from './stats-server.js';

/** stats-web in its container: the built page plus the API the page uses (ARCHITECTURE §19.5). */
const here = path.dirname(fileURLToPath(import.meta.url));
const { TELEMETRY_API_URL, TELEMETRY_INTERNAL_SECRET } = process.env;
if (!TELEMETRY_API_URL || !TELEMETRY_INTERNAL_SECRET) {
  console.error('TELEMETRY_API_URL and TELEMETRY_INTERNAL_SECRET are required.');
  process.exit(1);
}

const port = Number(process.env.STATS_PORT ?? 3001);
const server = createStatsServer({
  telemetryUrl: TELEMETRY_API_URL.replace(/\/$/, ''),
  internalSecret: TELEMETRY_INTERNAL_SECRET,
  staticDir: path.join(here, '..', 'client'),
  cacheMs: Number(process.env.STATS_CACHE_SECONDS ?? 300) * 1000,
});
server.listen(port, process.env.STATS_HOST ?? '0.0.0.0', () => {
  console.log(JSON.stringify({ service: 'stats-web', msg: 'listening', port }));
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
