import path from 'node:path';
import type { Backup, RestoreBackupResponse } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { ArchiveError } from '../../../platform/database/data-archive.js';
import {
  type BackupFile,
  LocalDataService,
} from '../../../platform/database/local-data.service.js';
import { LocalDataStore } from '../application/local-data.port.js';
import { BackupRejectedError } from '../domain/backup-errors.js';

@Injectable()
export class FileLocalDataStore extends LocalDataStore {
  constructor(private readonly localData: LocalDataService) {
    super();
  }

  async createBackup(): Promise<Backup> {
    return toBackup(this.localData.createBackup());
  }

  async listBackups(): Promise<Backup[]> {
    return this.localData.listBackups().map(toBackup);
  }

  async restore(archivePath: string): Promise<RestoreBackupResponse['restored']> {
    try {
      const { createdAt, appVersion, fileCount } = this.localData.restore(archivePath);
      return { createdAt, appVersion, fileCount };
    } catch (error) {
      if (error instanceof ArchiveError) {
        throw new BackupRejectedError(error.reason, error.message);
      }
      throw error;
    }
  }

  async wipe(): Promise<void> {
    this.localData.wipe();
  }
}

function toBackup(backup: BackupFile): Backup {
  return {
    path: backup.file,
    fileName: path.basename(backup.file),
    sizeBytes: backup.sizeBytes,
    createdAt: backup.createdAt,
    appVersion: backup.appVersion,
    fileCount: backup.fileCount,
  };
}
