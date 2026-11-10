import { Module } from '@nestjs/common';
import { SettingsRepository } from './application/settings.repository.js';
import { SettingsService } from './application/settings.service.js';
import { SettingsController } from './http/settings.controller.js';
import { DrizzleSettingsRepository } from './infrastructure/drizzle-settings.repository.js';

/** Non-secret preferences (ARCHITECTURE §4). Backups, AI usage and key verification come later. */
@Module({
  controllers: [SettingsController],
  providers: [
    SettingsService,
    { provide: SettingsRepository, useClass: DrizzleSettingsRepository },
  ],
  exports: [SettingsService],
})
export class SettingsModule {}
