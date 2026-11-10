import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrateDatabase } from '../../../platform/database/migrator.js';
import { openDatabase } from '../../../platform/database/sqlite.js';
import { createTempDir, MIGRATIONS_DIR } from '../../../test-support/temp-dir.js';
import type { SeedTool } from './tool-catalog-seed.js';
import { syncToolCatalog } from './tool-catalog-seeder.js';

const POSTGRES: SeedTool = {
  slug: 'postgresql',
  name: 'PostgreSQL',
  category: 'DATABASE',
  aliases: ['Postgres'],
};
const BUN: SeedTool = { slug: 'bun', name: 'Bun', category: 'FRAMEWORK', aliases: ['Bun.js'] };

describe('syncToolCatalog (integration, real SQLite file)', () => {
  let temp: ReturnType<typeof createTempDir>;
  let db: DatabaseSync;

  beforeEach(() => {
    temp = createTempDir();
    const databaseFile = path.join(temp.dir, 'careerly.db');
    migrateDatabase({ databaseFile, migrationsDir: MIGRATIONS_DIR, backupsDir: temp.dir });
    db = openDatabase(databaseFile);
  });
  afterEach(() => {
    if (db.isOpen) db.close();
    temp.cleanup();
  });

  function addUserTool(id: string, name: string, normalized: string) {
    db.prepare(
      "INSERT INTO tools (id, seed_slug, name, category, created_at) VALUES (?, NULL, ?, 'OTHER', '2026-01-01')",
    ).run(id, name);
    db.prepare('INSERT INTO tool_aliases (normalized, alias, tool_id) VALUES (?, ?, ?)').run(
      normalized,
      name,
      id,
    );
  }

  const aliasesOf = (toolId: string) =>
    db
      .prepare('SELECT normalized FROM tool_aliases WHERE tool_id = ? ORDER BY normalized')
      .all(toolId)
      .map((row) => row.normalized);

  it('inserts the seed and is idempotent', () => {
    expect(syncToolCatalog(db, [POSTGRES])).toEqual({
      inserted: 1,
      adopted: 0,
      updated: 0,
      aliasesAdded: 2,
      conflicts: 0,
    });
    expect(aliasesOf('postgresql')).toEqual(['postgres', 'postgresql']);

    expect(syncToolCatalog(db, [POSTGRES])).toEqual({
      inserted: 0,
      adopted: 0,
      updated: 0,
      aliasesAdded: 0,
      conflicts: 0,
    });
  });

  it('applies renames, new categories and new aliases from a newer seed', () => {
    syncToolCatalog(db, [POSTGRES]);
    const result = syncToolCatalog(db, [
      { ...POSTGRES, name: 'PostgreSQL DB', category: 'OTHER', aliases: ['Postgres', 'psql'] },
    ]);
    expect(result).toMatchObject({ updated: 1, aliasesAdded: 2 });
    expect(db.prepare('SELECT name, category FROM tools WHERE id = ?').get('postgresql')).toEqual({
      name: 'PostgreSQL DB',
      category: 'OTHER',
    });
  });

  it('adopts a user tool with the same name, keeping its id', () => {
    addUserTool('user-1', 'bun.js', 'bunjs');

    const result = syncToolCatalog(db, [BUN]);

    expect(result).toMatchObject({ inserted: 0, adopted: 1, aliasesAdded: 1 });
    expect(db.prepare('SELECT seed_slug, name FROM tools WHERE id = ?').get('user-1')).toEqual({
      seed_slug: 'bun',
      name: 'Bun',
    });
    expect(aliasesOf('user-1')).toEqual(['bun', 'bunjs']);
    expect(db.prepare('SELECT COUNT(*) AS count FROM tools').get()).toEqual({ count: 1 });
  });

  it('skips seed aliases owned by another tool and leaves user tools alone', () => {
    syncToolCatalog(db, [POSTGRES]);
    addUserTool('user-1', 'psql', 'psql');

    const result = syncToolCatalog(db, [{ ...POSTGRES, aliases: ['Postgres', 'psql'] }]);

    expect(result).toMatchObject({ conflicts: 1, aliasesAdded: 0 });
    expect(aliasesOf('user-1')).toEqual(['psql']);
    expect(db.prepare('SELECT seed_slug FROM tools WHERE id = ?').get('user-1')).toEqual({
      seed_slug: null,
    });
  });

  it('rolls back everything if the sync fails halfway', () => {
    const broken = { ...BUN, category: null } as unknown as SeedTool;
    expect(() => syncToolCatalog(db, [POSTGRES, broken])).toThrow();
    expect(db.prepare('SELECT COUNT(*) AS count FROM tools').get()).toEqual({ count: 0 });
  });
});
