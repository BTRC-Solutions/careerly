import { Module } from '@nestjs/common';
import { BackupService } from './application/backup.service.js';
import { LocalDataStore } from './application/local-data.port.js';
import { SettingsRepository } from './application/settings.repository.js';
import { SettingsService } from './application/settings.service.js';
import { BackupsController } from './http/backups.controller.js';
import { SettingsController } from './http/settings.controller.js';
import { DrizzleSettingsRepository } from './infrastructure/drizzle-settings.repository.js';
import { FileLocalDataStore } from './infrastructure/file-local-data.store.js';

/** Non-secret preferences, backups and data deletion (ARCHITECTURE §4). AI usage and key verification come later. */
@Module({
  controllers: [SettingsController, BackupsController],
  providers: [
    SettingsService,
    BackupService,
    { provide: SettingsRepository, useClass: DrizzleSettingsRepository },
    { provide: LocalDataStore, useClass: FileLocalDataStore },
  ],
  exports: [SettingsService],
})
export class SettingsModule {}
