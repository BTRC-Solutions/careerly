import 'reflect-metadata';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { pino } from 'pino';
import { loadConfig } from './config.js';
import * as schema from './database/schema.js';
import { startServer } from './server.js';

/**
 * The receiver in its container: JSON logs to stdout (Docker rotates them), without IPs or report content
 * (RNF-23, ARCHITECTURE §19.7). Migrations run apart, with `migrate.js`, before each deploy.
 */
async function main() {
  const logger = pino({ base: { service: 'telemetry-api' } });
  const config = loadConfig(process.env);
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  const server = await startServer({
    config,
    db: drizzle(pool, { schema }),
    logger,
    now: () => new Date(),
  });

  const shutdown = async () => {
    logger.info('Shutting down');
    await server.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
