import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTempDir, MIGRATIONS_DIR } from '../../test-support/temp-dir.js';
import { createDrizzle } from './drizzle.js';
import { migrateDatabase } from './migrator.js';
import { settings } from './schema.js';
import { openDatabase } from './sqlite.js';

describe('createDrizzle (integration, node:sqlite through the proxy driver)', () => {
  let temp: ReturnType<typeof createTempDir>;
  let connection: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    temp = createTempDir();
    const databaseFile = path.join(temp.dir, 'careerly.db');
    migrateDatabase({ databaseFile, migrationsDir: MIGRATIONS_DIR, backupsDir: temp.dir });
    connection = openDatabase(databaseFile);
  });
  afterEach(() => {
    // Close before deleting: Windows cannot remove an open database file.
    if (connection.isOpen) connection.close();
    temp.cleanup();
  });

  it('writes and reads rows with the right column mapping', async () => {
    const db = createDrizzle(connection);

    await db.insert(settings).values([
      { key: 'a', value: '"first"', updatedAt: '2026-11-10T00:00:00.000Z' },
      { key: 'b', value: '"second"', updatedAt: '2026-11-11T00:00:00.000Z' },
    ]);

    const all = await db.select().from(settings).orderBy(settings.key);
    expect(all).toEqual([
      { key: 'a', value: '"first"', updatedAt: '2026-11-10T00:00:00.000Z' },
      { key: 'b', value: '"second"', updatedAt: '2026-11-11T00:00:00.000Z' },
    ]);

    const one = await db.select().from(settings).where(eq(settings.key, 'b')).get();
    expect(one?.value).toBe('"second"');

    const missing = await db.select().from(settings).where(eq(settings.key, 'zzz')).get();
    expect(missing).toBeUndefined();
  });
});
