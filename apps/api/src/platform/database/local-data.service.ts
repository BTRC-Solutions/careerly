import fs from 'node:fs';
import path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import {
  ArchiveError,
  ARCHIVE_EXTENSION,
  type ArchiveInfo,
  extractArchive,
  readArchiveInfo,
  removeDatabaseFiles,
  writeArchive,
} from './data-archive.js';
import { DatabaseService } from './database.service.js';
import { knownMigrationTags, MigrationError } from './migrator.js';

const SAFETY_COPIES_TO_KEEP = 5;

export interface BackupFile extends ArchiveInfo {
  file: string;
  sizeBytes: number;
}

/**
 * Backup, restore and deletion of all local data (RF-CONF-04, RF-CONF-05): the database plus the `files/`
 * folder. Manual backups go to `backups/manual/`; the user can also restore an archive from anywhere.
 */
@Injectable()
export class LocalDataService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly database: DatabaseService,
  ) {}

  get manualBackupsDir(): string {
    return path.join(this.config.backupsDir, 'manual');
  }

  createBackup(now = new Date()): BackupFile {
    const file = path.join(this.manualBackupsDir, `careerly-${stamp(now)}${ARCHIVE_EXTENSION}`);
    const info = writeArchive({
      connection: this.database.connection,
      filesDir: this.config.filesDir,
      targetFile: file,
      appVersion: this.config.appVersion,
      now,
    });
    return { ...info, file, sizeBytes: fs.statSync(file).size };
  }

  /** Manual backups, newest first. Files that are not valid archives are skipped. */
  listBackups(): BackupFile[] {
    if (!fs.existsSync(this.manualBackupsDir)) return [];
    const known = knownMigrationTags(this.config.migrationsDir);
    return fs
      .readdirSync(this.manualBackupsDir)
      .filter((name) => name.endsWith(ARCHIVE_EXTENSION))
      .flatMap((name) => {
        const file = path.join(this.manualBackupsDir, name);
        try {
          return [{ ...readArchiveInfo(file, known), file, sizeBytes: fs.statSync(file).size }];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Replaces all local data with the archive. The current database is copied to
   * `backups/careerly-<date>-pre-restore.db` first; if anything fails, the previous data is put back.
   * Throws `ArchiveError` for missing, invalid or too new archives (nothing is changed then).
   */
  restore(archiveFile: string, now = new Date()): ArchiveInfo {
    const info = readArchiveInfo(archiveFile, knownMigrationTags(this.config.migrationsDir));
    const { databaseFile, filesDir, backupsDir } = this.config;

    fs.mkdirSync(backupsDir, { recursive: true });
    const safetyCopy = path.join(backupsDir, `careerly-${stamp(now)}-pre-restore.db`);
    this.database.connection.prepare('VACUUM INTO ?').run(safetyCopy);
    const previousFiles = `${filesDir}.pre-restore`;
    fs.rmSync(previousFiles, { recursive: true, force: true });
    if (fs.existsSync(filesDir)) fs.renameSync(filesDir, previousFiles);

    try {
      this.database.replace(
        () => extractArchive(archiveFile, { databaseFile, filesDir }),
        () => {
          removeDatabaseFiles(databaseFile);
          fs.copyFileSync(safetyCopy, databaseFile);
          fs.rmSync(filesDir, { recursive: true, force: true });
          if (fs.existsSync(previousFiles)) fs.renameSync(previousFiles, filesDir);
        },
      );
    } catch (error) {
      if (error instanceof MigrationError) {
        throw new ArchiveError(
          'INVALID',
          'The backup could not be upgraded to this version of Careerly. Your current data was kept.',
        );
      }
      throw error;
    }

    fs.rmSync(previousFiles, { recursive: true, force: true });
    pruneSafetyCopies(backupsDir);
    return info;
  }

  /** Deletes the database, generated files and every backup, leaving an empty, migrated database. */
  wipe(): void {
    const { databaseFile, filesDir, backupsDir } = this.config;
    this.database.replace(
      () => {
        removeDatabaseFiles(databaseFile);
        fs.rmSync(filesDir, { recursive: true, force: true });
        fs.rmSync(backupsDir, { recursive: true, force: true });
      },
      // Nothing to put back: the data is already gone and a fresh database is created on reopen.
      () => undefined,
    );
  }
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function pruneSafetyCopies(backupsDir: string) {
  const copies = fs
    .readdirSync(backupsDir)
    .filter((name) => name.endsWith('-pre-restore.db'))
    .sort();
  for (const name of copies.slice(0, Math.max(0, copies.length - SAFETY_COPIES_TO_KEEP))) {
    fs.rmSync(path.join(backupsDir, name), { force: true });
  }
}
