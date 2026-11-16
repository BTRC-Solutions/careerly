import type { Backup, ListBackupsResponse, RestoreBackupResponse } from '@careerly/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { LocalDataStore } from './local-data.port.js';

/** Backup, restore and deletion of all local data (RF-CONF-04, RF-CONF-05). */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(private readonly store: LocalDataStore) {}

  async create(): Promise<Backup> {
    const backup = await this.store.createBackup();
    this.logger.log(`Backup created: ${backup.fileName} (${backup.sizeBytes} bytes).`);
    return backup;
  }

  async list(): Promise<ListBackupsResponse> {
    return { backups: await this.store.listBackups() };
  }

  async restore(archivePath: string): Promise<RestoreBackupResponse> {
    const restored = await this.store.restore(archivePath);
    this.logger.log(`Backup restored (created ${restored.createdAt} by ${restored.appVersion}).`);
    return { restored };
  }

  async deleteAll(): Promise<void> {
    await this.store.wipe();
    this.logger.warn('All local data was deleted at the user request.');
  }
}
