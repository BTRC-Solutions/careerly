import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema.js';
import { inTransaction } from './sqlite.js';

export type AppDatabase = SqliteRemoteDatabase<typeof schema>;

type Method = 'run' | 'all' | 'values' | 'get';

/**
 * Drizzle has no driver for `node:sqlite` yet, so we use its `sqlite-proxy` driver
 * and execute the generated SQL on our own connection. Rows are returned as arrays,
 * which is what the proxy driver expects.
 *
 * Atomic writes: `db.transaction()` is not supported by the proxy driver, but `db.batch([...])` is,
 * and runs every statement inside one SQLite transaction (all or nothing). For logic that has to
 * read between writes, use `inTransaction()` from `sqlite.ts` on the raw connection.
 */
export function createDrizzle(connection: DatabaseSync): AppDatabase {
  const execute = (sql: string, params: unknown[], method: Method) => {
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
  };

  return drizzle(
    async (sql, params, method) => execute(sql, params, method),
    async (queries) =>
      inTransaction(connection, () =>
        queries.map((query) => execute(query.sql, query.params, query.method)),
      ),
    { schema },
  );
}
