import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTempDir, MIGRATIONS_DIR } from '../../test-support/temp-dir.js';
import { MigrationError, migrateDatabase } from './migrator.js';
import { openDatabase } from './sqlite.js';

describe('migrateDatabase (integration, real SQLite file)', () => {
  let temp: ReturnType<typeof createTempDir>;
  let options: Parameters<typeof migrateDatabase>[0];

  beforeEach(() => {
    temp = createTempDir();
    options = {
      databaseFile: path.join(temp.dir, 'careerly.db'),
      migrationsDir: MIGRATIONS_DIR,
      backupsDir: path.join(temp.dir, 'backups'),
    };
  });
  afterEach(() => temp.cleanup());

  it('applies all migrations to a new database without a backup', () => {
    const result = migrateDatabase(options);
    expect(result.applied).toEqual(['0000_init']);
    expect(result.backupFile).toBeUndefined();
  });

  it('does nothing when the database is up to date', () => {
    migrateDatabase(options);
    const second = migrateDatabase(options);
    expect(second).toEqual({ applied: [], totalApplied: 1, backupFile: undefined });
  });

  it('restores the backup when a migration fails (RNF-20)', () => {
    // Existing user data, migrated with the real migrations.
    migrateDatabase(options);
    const db = openDatabase(options.databaseFile);
    db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      'ui.language',
      '"es"',
      '2026-11-10T00:00:00.000Z',
    );
    db.close();

    // A new release ships a migration whose second statement fails.
    const brokenDir = path.join(temp.dir, 'migrations');
    fs.cpSync(MIGRATIONS_DIR, brokenDir, { recursive: true });
    fs.writeFileSync(
      path.join(brokenDir, '0001_broken.sql'),
      'CREATE TABLE `partial` (`id` integer);\n--> statement-breakpoint\nTHIS IS NOT SQL;',
    );
    const journalPath = path.join(brokenDir, 'meta', '_journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
      entries: { idx: number; tag: string }[];
    };
    journal.entries.push({ idx: 1, tag: '0001_broken' });
    fs.writeFileSync(journalPath, JSON.stringify(journal));

    let error: unknown;
    try {
      migrateDatabase({ ...options, migrationsDir: brokenDir });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(MigrationError);
    const migrationError = error as MigrationError;
    expect(migrationError.tag).toBe('0001_broken');
    expect(migrationError.backupFile && fs.existsSync(migrationError.backupFile)).toBe(true);

    // The database is exactly as before: data kept, no half-applied table, migration not recorded.
    const after = openDatabase(options.databaseFile);
    expect(after.prepare('SELECT value FROM settings WHERE key = ?').get('ui.language')).toEqual({
      value: '"es"',
    });
    expect(
      after
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'partial'")
        .get(),
    ).toBeUndefined();
    expect(after.prepare('SELECT COUNT(*) AS count FROM __careerly_migrations').get()).toEqual({
      count: 1,
    });
    after.close();
  });
});
