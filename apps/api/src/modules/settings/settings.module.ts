import { Module } from '@nestjs/common';
import { AiKeySource, AiKeyVerifier } from './application/ai-key.ports.js';
import { AiKeyService } from './application/ai-key.service.js';
import { SettingsRepository } from './application/settings.repository.js';
import { SettingsService } from './application/settings.service.js';
import { SettingsController } from './http/settings.controller.js';
import { AnthropicKeyVerifier } from './infrastructure/anthropic-key-verifier.js';
import { DrizzleSettingsRepository } from './infrastructure/drizzle-settings.repository.js';
import { MemoryAiKeySource } from './infrastructure/memory-ai-key-source.js';

/** Non-secret preferences and AI key verification (ARCHITECTURE §4). Backups and AI usage come later. */
@Module({
  controllers: [SettingsController],
  providers: [
    SettingsService,
    AiKeyService,
    { provide: SettingsRepository, useClass: DrizzleSettingsRepository },
    { provide: AiKeySource, useClass: MemoryAiKeySource },
    { provide: AiKeyVerifier, useClass: AnthropicKeyVerifier },
  ],
  exports: [SettingsService],
})
export class SettingsModule {}
