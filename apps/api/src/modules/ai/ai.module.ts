import { Global, Module } from '@nestjs/common';
import { AiCredentialsStore } from './application/ai-credentials.store.js';
import { LlmClient } from './application/llm-client.js';
import { AiGenerationRepository, LlmProviderRegistry } from './application/llm.ports.js';
import { AiSmokeTestService } from './application/smoke-test.service.js';
import { InternalAiCredentialsController } from './http/internal-ai-credentials.controller.js';
import { InternalAiSmokeController } from './http/internal-ai-smoke.controller.js';
import { DrizzleAiGenerationRepository } from './infrastructure/drizzle-ai-generation.repository.js';
import { GeminiLlmProvider } from './infrastructure/gemini-llm.provider.js';
import { StaticLlmProviderRegistry } from './infrastructure/llm-provider.registry.js';

/**
 * AI infrastructure (ARCHITECTURE §4, §7.3, ADR-23): the active key in memory, `LlmClient` (the
 * single entry point for AI calls) and one adapter per provider (Gemini first).
 * Global so other modules can inject `AiCredentialsStore` and `LlmClient`.
 */
@Global()
@Module({
  controllers: [InternalAiCredentialsController, InternalAiSmokeController],
  providers: [
    AiCredentialsStore,
    LlmClient,
    AiSmokeTestService,
    GeminiLlmProvider,
    { provide: LlmProviderRegistry, useClass: StaticLlmProviderRegistry },
    { provide: AiGenerationRepository, useClass: DrizzleAiGenerationRepository },
  ],
  exports: [AiCredentialsStore, LlmClient],
})
export class AiModule {}
