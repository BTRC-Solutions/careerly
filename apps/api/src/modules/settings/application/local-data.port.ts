import type { Backup, RestoreBackupResponse } from '@careerly/contracts';

/**
 * Port: archives, restores and deletes all local data (database + generated files).
 * Declared as an abstract class so it can be used as a Nest DI token.
 */
export abstract class LocalDataStore {
  abstract createBackup(): Promise<Backup>;

  /** Manual backups, newest first. */
  abstract listBackups(): Promise<Backup[]>;

  /** Throws `BackupRejectedError` when the archive is missing, invalid or too new. */
  abstract restore(archivePath: string): Promise<RestoreBackupResponse['restored']>;

  abstract wipe(): Promise<void>;
}
