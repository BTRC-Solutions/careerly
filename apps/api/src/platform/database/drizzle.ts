import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema.js';

export type AppDatabase = SqliteRemoteDatabase<typeof schema>;

/**
 * Drizzle has no driver for `node:sqlite` yet, so we use its `sqlite-proxy` driver
 * and execute the generated SQL on our own connection. Rows are returned as arrays,
 * which is what the proxy driver expects.
 *
 * Note: `db.transaction()` is not supported by the proxy driver; use `inTransaction()` from `sqlite.ts`.
 */
export function createDrizzle(connection: DatabaseSync): AppDatabase {
  return drizzle(
    async (sql, params, method) => {
      const statement = connection.prepare(sql);
      const values = params as SQLInputValue[];

      if (method === 'run') {
        statement.run(...values);
        return { rows: [] };
      }

      statement.setReturnArrays(true);
      if (method === 'get') {
        // No row must stay `undefined`; an empty array would be mapped to an object of undefined fields.
        const row = statement.get(...values) as unknown as unknown[] | undefined;
        return { rows: row as unknown[] };
      }
      const rows = statement.all(...values) as unknown as unknown[][];
      return { rows };
    },
    { schema },
  );
}
