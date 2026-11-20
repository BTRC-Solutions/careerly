import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type * as schema from './schema.js';

/** Drizzle over Postgres: `node-postgres` in production, PGlite in the tests. */
export type TelemetryDb = PgDatabase<PgQueryResultHKT, typeof schema>;

/** The rows of `db.execute(...)`, which both drivers return under `rows`. */
export function rowsOf<T>(result: unknown): T[] {
  return (result as { rows: T[] }).rows;
}
