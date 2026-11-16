import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { SMOKE_TEST_V1 } from './prompts/smoke-test.v1.js';
import { ActiveAiCredentials } from './active-ai-credentials.js';
import { AiError, AiNotConfiguredError, AiProviderNotSupportedError } from './llm-errors.js';
import { LlmProviderRegistry } from './llm.ports.js';
import { LlmClient } from './llm-client.js';

const SmokeAnswerSchema = z.object({
  ok: z.literal(true),
  /** The Spanish word for "hello", lowercase, to prove the model followed instructions. */
  greeting: z.string().min(1).max(40),
});

export interface SmokeTestResult {
  status: 'OK' | string;
  provider: string | null;
  model: string | null;
  attempts: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

/** Runs one tiny structured call with the active provider (step 4.1 manual check, diagnostics). */
@Injectable()
export class AiSmokeTestService {
  constructor(
    private readonly llm: LlmClient,
    private readonly credentials: ActiveAiCredentials,
    private readonly providers: LlmProviderRegistry,
  ) {}

  /** Models the active key can use for generation (names only). */
  async availableModels(): Promise<{ provider: string; models: string[] }> {
    const active = await this.credentials.get();
    if (!active) throw new AiNotConfiguredError();
    const provider = this.providers.get(active.provider);
    if (!provider) throw new AiProviderNotSupportedError(active.provider);
    return { provider: active.provider, models: await provider.listModels(active.apiKey) };
  }

  /**
   * One minimal structured call; throws an `AiError` if it fails. With `model`, only that model is
   * tried (no fallbacks): this is how a model is checked before the user chooses it.
   */
  probe(model?: string) {
    return this.llm.generateStructured({
      task: 'smoke-test',
      prompt: SMOKE_TEST_V1,
      tier: 'small',
      ...(model ? { model } : {}),
      input: [
        {
          type: 'text',
          text: 'Set "ok" to true and "greeting" to the Spanish word for "hello", in lowercase.',
        },
      ],
      schema: SmokeAnswerSchema,
      timeoutMs: 30_000,
    });
  }

  /** `model` overrides the small-tier default, to try a specific model. */
  async run(model?: string): Promise<SmokeTestResult> {
    try {
      const { data, usage } = await this.probe(model);
      return {
        status: data.ok ? 'OK' : 'INVALID_OUTPUT',
        provider: usage.provider,
        model: usage.model,
        attempts: usage.attempts,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd,
        latencyMs: usage.latencyMs,
      };
    } catch (error) {
      if (!(error instanceof AiError)) throw error;
      return {
        status: error.code,
        provider: null,
        model: null,
        attempts: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: 0,
      };
    }
  }
}
