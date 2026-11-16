import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { appliedMigrationTags } from './migrator.js';
import { inTransaction } from './sqlite.js';

/**
 * Single-file backup of all local data (RF-CONF-04).
 *
 * The archive is itself a SQLite database: a `VACUUM INTO` copy of the app database plus two extra tables
 * with the archive metadata and every file under the `files/` folder (PDFs). One file, no extra dependency,
 * and SQLite guarantees its integrity. The AI API key is never in the database, so it is never archived.
 */
export const ARCHIVE_EXTENSION = '.careerly-backup';
const ARCHIVE_FORMAT = 1;
const META_TABLE = '__careerly_backup_meta';
const FILES_TABLE = '__careerly_backup_files';

export interface ArchiveInfo {
  createdAt: string;
  appVersion: string;
  fileCount: number;
}

export type ArchiveErrorReason = 'NOT_FOUND' | 'INVALID' | 'TOO_NEW';

export class ArchiveError extends Error {
  constructor(
    readonly reason: ArchiveErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'ArchiveError';
  }
}

/** Writes an archive of the open database and the files folder to `targetFile`. */
export function writeArchive(options: {
  connection: DatabaseSync;
  filesDir: string;
  targetFile: string;
  appVersion: string;
  now?: Date;
}): ArchiveInfo {
  fs.mkdirSync(path.dirname(options.targetFile), { recursive: true });
  fs.rmSync(options.targetFile, { force: true });
  options.connection.prepare('VACUUM INTO ?').run(options.targetFile);

  const files = listFiles(options.filesDir);
  const info: ArchiveInfo = {
    createdAt: (options.now ?? new Date()).toISOString(),
    appVersion: options.appVersion,
    fileCount: files.length,
  };

  const archive = new DatabaseSync(options.targetFile);
  try {
    // The copy is not in WAL mode, so the archive stays a single self-contained file.
    archive.exec('PRAGMA journal_mode = DELETE;');
    inTransaction(archive, () => {
      archive.exec(
        `CREATE TABLE ${META_TABLE} (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`,
      );
      archive.exec(
        `CREATE TABLE ${FILES_TABLE} (path TEXT PRIMARY KEY NOT NULL, content BLOB NOT NULL);`,
      );
      const meta = archive.prepare(`INSERT INTO ${META_TABLE} (key, value) VALUES (?, ?)`);
      meta.run('format', String(ARCHIVE_FORMAT));
      meta.run('createdAt', info.createdAt);
      meta.run('appVersion', info.appVersion);

      const insertFile = archive.prepare(
        `INSERT INTO ${FILES_TABLE} (path, content) VALUES (?, ?)`,
      );
      for (const relative of files) {
        insertFile.run(relative, fs.readFileSync(path.join(options.filesDir, relative)));
      }
    });
  } finally {
    archive.close();
  }
  return info;
}

/**
 * Validates an archive without changing anything. Rejects files that are not archives and archives
 * created by a newer app version (with migrations this version does not know).
 */
export function readArchiveInfo(file: string, knownMigrationTags: string[]): ArchiveInfo {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new ArchiveError('NOT_FOUND', 'The backup file does not exist.');
  }

  let archive: DatabaseSync;
  try {
    archive = new DatabaseSync(file, { readOnly: true });
  } catch {
    throw new ArchiveError('INVALID', 'The file is not a Careerly backup.');
  }

  try {
    const meta = readMeta(archive);
    if (meta.format !== String(ARCHIVE_FORMAT) || !meta.createdAt || !meta.appVersion) {
      throw new ArchiveError('INVALID', 'The file is not a Careerly backup.');
    }

    const known = new Set(knownMigrationTags);
    if (appliedMigrationTags(archive).some((tag) => !known.has(tag))) {
      throw new ArchiveError(
        'TOO_NEW',
        `The backup was created by a newer version of Careerly (${meta.appVersion}). Update the app to restore it.`,
      );
    }

    const paths = archive.prepare(`SELECT path FROM ${FILES_TABLE}`).all();
    for (const row of paths) {
      resolveInside('/archive-root', String(row.path));
    }
    return { createdAt: meta.createdAt, appVersion: meta.appVersion, fileCount: paths.length };
  } finally {
    archive.close();
  }
}

/**
 * Replaces the database file and the files folder with the archive contents.
 * The database must be closed. Call {@link readArchiveInfo} first: it validates the file paths.
 */
export function extractArchive(
  file: string,
  target: { databaseFile: string; filesDir: string },
): void {
  removeDatabaseFiles(target.databaseFile);
  fs.mkdirSync(path.dirname(target.databaseFile), { recursive: true });
  fs.copyFileSync(file, target.databaseFile);

  const db = new DatabaseSync(target.databaseFile);
  try {
    fs.rmSync(target.filesDir, { recursive: true, force: true });
    const rows = db.prepare(`SELECT path, content FROM ${FILES_TABLE}`).all();
    for (const row of rows) {
      const destination = resolveInside(target.filesDir, String(row.path));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, row.content as Uint8Array);
    }
    db.exec(`DROP TABLE ${FILES_TABLE}; DROP TABLE ${META_TABLE};`);
    db.exec('VACUUM;');
  } finally {
    db.close();
  }
}

/** Deletes the database file and its WAL/SHM companions. The database must be closed. */
export function removeDatabaseFiles(databaseFile: string): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    fs.rmSync(`${databaseFile}${suffix}`, { force: true });
  }
}

function readMeta(archive: DatabaseSync): Record<string, string> {
  try {
    const rows = archive.prepare(`SELECT key, value FROM ${META_TABLE}`).all();
    return Object.fromEntries(rows.map((row) => [String(row.key), String(row.value)]));
  } catch {
    // Not a SQLite file, or a SQLite file without the archive tables.
    throw new ArchiveError('INVALID', 'The file is not a Careerly backup.');
  }
}

/** Relative paths (with `/`) of every file under `dir`, sorted. */
function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'),
    )
    .sort();
}

/** Resolves an archived path inside `root`, rejecting anything that would escape it. */
function resolveInside(root: string, relative: string): string {
  const resolved = path.resolve(root, relative);
  if (path.isAbsolute(relative) || !resolved.startsWith(path.resolve(root) + path.sep)) {
    throw new ArchiveError('INVALID', 'The backup contains an invalid file path.');
  }
  return resolved;
}
