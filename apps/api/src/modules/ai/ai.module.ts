import { Global, Module } from '@nestjs/common';
import { ActiveAiCredentials } from './application/active-ai-credentials.js';
import { AiCredentialsStore } from './application/ai-credentials.store.js';
import { AiModelChoiceStore } from './application/ai-model-choice.store.js';
import { AiModelsService } from './application/ai-models.service.js';
import { AiUsageService } from './application/ai-usage.service.js';
import { LlmClient } from './application/llm-client.js';
import { AiGenerationRepository, LlmProviderRegistry } from './application/llm.ports.js';
import { AiSmokeTestService } from './application/smoke-test.service.js';
import { AiController } from './http/ai.controller.js';
import { InternalAiCredentialsController } from './http/internal-ai-credentials.controller.js';
import { InternalAiSmokeController } from './http/internal-ai-smoke.controller.js';
import { DrizzleAiGenerationRepository } from './infrastructure/drizzle-ai-generation.repository.js';
import { ClaudeCodeProbe } from './application/claude-code.port.js';
import { AnthropicLlmProvider } from './infrastructure/anthropic-llm.provider.js';
import { ClaudeCodeCli } from './infrastructure/claude-code-cli.js';
import { ClaudeCodeLlmProvider } from './infrastructure/claude-code-llm.provider.js';
import { GeminiLlmProvider } from './infrastructure/gemini-llm.provider.js';
import { StaticLlmProviderRegistry } from './infrastructure/llm-provider.registry.js';

/**
 * AI infrastructure (ARCHITECTURE §4, §7.3, ADR-23): the active key in memory, `LlmClient` (the
 * single entry point for AI calls) and one adapter per provider (Gemini first).
 * Global so other modules can inject `AiCredentialsStore`, `LlmClient` and the model choice
 * services (RF-CONF-09).
 */
@Global()
@Module({
  controllers: [AiController, InternalAiCredentialsController, InternalAiSmokeController],
  providers: [
    AiCredentialsStore,
    ActiveAiCredentials,
    AiModelChoiceStore,
    AiModelsService,
    AiUsageService,
    LlmClient,
    AiSmokeTestService,
    GeminiLlmProvider,
    AnthropicLlmProvider,
    ClaudeCodeCli,
    ClaudeCodeLlmProvider,
    { provide: ClaudeCodeProbe, useExisting: ClaudeCodeCli },
    { provide: LlmProviderRegistry, useClass: StaticLlmProviderRegistry },
    { provide: AiGenerationRepository, useClass: DrizzleAiGenerationRepository },
  ],
  exports: [
    AiCredentialsStore,
    ActiveAiCredentials,
    ClaudeCodeProbe,
    AiModelChoiceStore,
    AiModelsService,
    LlmClient,
  ],
})
export class AiModule {}
