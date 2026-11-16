import { Module } from '@nestjs/common';
import { AiCredentialsStore } from './application/ai-credentials.store.js';
import { InternalAiCredentialsController } from './http/internal-ai-credentials.controller.js';

/**
 * AI infrastructure (ARCHITECTURE §4, §7.3). For now it only holds the active provider's API key in
 * memory; the `LlmClient` port and the provider adapters arrive in F4.1 (Gemini first, ADR-19).
 */
@Module({
  controllers: [InternalAiCredentialsController],
  providers: [AiCredentialsStore],
  exports: [AiCredentialsStore],
})
export class AiModule {}
