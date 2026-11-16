import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTempDir, MIGRATIONS_DIR } from '../../test-support/temp-dir.js';
import { migrateDatabase } from './migrator.js';
import { openDatabase } from './sqlite.js';

/** Data-preserving checks for specific migrations, run against a database at an older version. */
describe('data migrations (integration)', () => {
  let temp: ReturnType<typeof createTempDir>;
  let databaseFile: string;

  beforeEach(() => {
    temp = createTempDir();
    databaseFile = path.join(temp.dir, 'careerly.db');
  });
  afterEach(() => temp.cleanup());

  /** Migrates a new database only up to (and including) `lastTag`. */
  function migrateUpTo(lastTag: string) {
    const partialDir = path.join(temp.dir, `migrations-${lastTag}`);
    fs.cpSync(MIGRATIONS_DIR, partialDir, { recursive: true });
    const journalPath = path.join(partialDir, 'meta', '_journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
      entries: { tag: string }[];
    };
    const last = journal.entries.findIndex((entry) => entry.tag === lastTag);
    expect(last).toBeGreaterThanOrEqual(0);
    journal.entries = journal.entries.slice(0, last + 1);
    fs.writeFileSync(journalPath, JSON.stringify(journal));
    migrateDatabase({ databaseFile, migrationsDir: partialDir, backupsDir: temp.dir });
  }

  it('0003/0004 keep an existing full name as the given names', () => {
    migrateUpTo('0002_profile');
    const before = openDatabase(databaseFile);
    before
      .prepare(
        "INSERT INTO profile_personal_info (id, full_name, links, updated_at) VALUES (1, ?, '[]', ?)",
      )
      .run('María José García López', '2026-11-10T00:00:00.000Z');
    before.close();

    migrateDatabase({ databaseFile, migrationsDir: MIGRATIONS_DIR, backupsDir: temp.dir });

    const after = openDatabase(databaseFile);
    expect(
      after.prepare('SELECT first_names, last_names FROM profile_personal_info').get(),
    ).toEqual({ first_names: 'María José García López', last_names: null });
    const columns = after
      .prepare('PRAGMA table_info(profile_personal_info)')
      .all()
      .map((column) => column.name);
    expect(columns).not.toContain('full_name');
    after.close();
  });
});
