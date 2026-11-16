import { Module } from '@nestjs/common';
import { AiKeySource, AiKeyVerifier } from './application/ai-key.ports.js';
import { AiKeyService } from './application/ai-key.service.js';
import { BackupService } from './application/backup.service.js';
import { LocalDataStore } from './application/local-data.port.js';
import { SettingsRepository } from './application/settings.repository.js';
import { SettingsService } from './application/settings.service.js';
import { BackupsController } from './http/backups.controller.js';
import { SettingsController } from './http/settings.controller.js';
import { AnthropicKeyVerifier } from './infrastructure/anthropic-key-verifier.js';
import { DrizzleSettingsRepository } from './infrastructure/drizzle-settings.repository.js';
import { FileLocalDataStore } from './infrastructure/file-local-data.store.js';
import { GeminiKeyVerifier } from './infrastructure/gemini-key-verifier.js';
import { MemoryAiKeySource } from './infrastructure/memory-ai-key-source.js';
import { ProviderKeyVerifier } from './infrastructure/provider-key-verifier.js';

/** Non-secret preferences, AI key verification, backups and data deletion (ARCHITECTURE §4). AI usage comes later. */
@Module({
  controllers: [SettingsController, BackupsController],
  providers: [
    SettingsService,
    AiKeyService,
    BackupService,
    { provide: SettingsRepository, useClass: DrizzleSettingsRepository },
    { provide: AiKeySource, useClass: MemoryAiKeySource },
    GeminiKeyVerifier,
    AnthropicKeyVerifier,
    { provide: AiKeyVerifier, useClass: ProviderKeyVerifier },
    { provide: LocalDataStore, useClass: FileLocalDataStore },
  ],
  exports: [SettingsService],
})
export class SettingsModule {}
