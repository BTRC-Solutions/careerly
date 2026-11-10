import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Opens the local SQLite database with the settings every connection must use.
 * Uses Node's built-in `node:sqlite`, so there is no native module to rebuild for Electron.
 */
export function openDatabase(file: string): DatabaseSync {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  return db;
}

/** Runs `fn` inside a transaction. Rolls back if it throws. */
export function inTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    if (db.isTransaction) {
      db.exec('ROLLBACK;');
    }
    throw error;
  }
}
