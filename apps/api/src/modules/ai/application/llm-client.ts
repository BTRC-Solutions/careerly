import { randomUUID } from 'node:crypto';
import type { AiGenerationStatus, AiProvider, AiTask } from '@careerly/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { AiCredentialsStore } from './ai-credentials.store.js';
import { AiModelChoiceStore } from './ai-model-choice.store.js';
import {
  AiError,
  AiInvalidOutputError,
  AiModelUnavailableError,
  AiNotConfiguredError,
  AiProviderNotSupportedError,
} from './llm-errors.js';
import { AiGenerationRepository, LlmProviderRegistry } from './llm.ports.js';
import type {
  LlmPart,
  LlmTurn,
  LlmUsage,
  ModelTier,
  PromptVersion,
  ProviderResponse,
} from './llm.types.js';

const DEFAULT_TIMEOUT_MS = 120_000;
/** One try plus one retry with the validation problems, per model. */
const MAX_ATTEMPTS_PER_MODEL = 2;

export interface StructuredRequest<T extends z.ZodType> {
  task: AiTask;
  prompt: PromptVersion;
  tier: ModelTier;
  /** Uses only this model, without fallbacks (to try a model before choosing it). */
  model?: string;
  /** The user turn: instructions for this call plus data (wrap untrusted data with `untrustedText`). */
  input: LlmPart[];
  /** Expected answer. Keep it free of transforms: it is also sent to the provider as JSON Schema. */
  schema: T;
  timeoutMs?: number;
}

export interface StructuredResult<T> {
  data: T;
  usage: LlmUsage;
}

/**
 * Entry point for every AI call (ARCHITECTURE §7.3, ADR-23). Uses the active provider and key,
 * asks for JSON that matches the schema, validates it with Zod and retries once with the
 * validation error. Every attempt is recorded in `AiGeneration` (tokens, cost, latency) without
 * any content. Prompts, answers and keys are never logged (RNF-02, RNF-03).
 */
@Injectable()
export class LlmClient {
  private readonly logger = new Logger(LlmClient.name);

  constructor(
    private readonly credentials: AiCredentialsStore,
    private readonly providers: LlmProviderRegistry,
    private readonly generations: AiGenerationRepository,
    private readonly choices: AiModelChoiceStore,
  ) {}

  /** Whether AI calls can be attempted at all (a key is configured for a supported provider). */
  isAvailable(): boolean {
    const active = this.credentials.get();
    return active !== null && this.providers.get(active.provider) !== undefined;
  }

  async generateStructured<T extends z.ZodType>(
    request: StructuredRequest<T>,
  ): Promise<StructuredResult<z.infer<T>>> {
    const credentials = this.credentials.get();
    if (!credentials) throw new AiNotConfiguredError();
    const provider = this.providers.get(credentials.provider);
    if (!provider) throw new AiProviderNotSupportedError(credentials.provider);

    const models = request.model
      ? [request.model]
      : await this.modelsFor(credentials.provider, request.tier);
    const jsonSchema = toProviderJsonSchema(request.schema);
    const usage: LlmUsage = {
      provider: credentials.provider,
      model: models[0]!,
      attempts: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: 0,
    };
    let attempt = 0;
    let lastUnavailable: AiModelUnavailableError | undefined;

    // A retired or overloaded model is skipped in favor of the next one of the tier.
    for (const model of models) {
      usage.model = model;
      const turns: LlmTurn[] = [{ role: 'user', parts: request.input }];

      for (let tryOnModel = 1; tryOnModel <= MAX_ATTEMPTS_PER_MODEL; tryOnModel++) {
        attempt++;
        const startedAt = Date.now();
        let response: ProviderResponse;
        try {
          response = await provider.generateJson({
            apiKey: credentials.apiKey,
            model,
            system: request.prompt.system,
            turns,
            jsonSchema,
            timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          });
        } catch (error) {
          const code = error instanceof AiError ? error.code : 'UNEXPECTED';
          await this.record(request, usage, attempt, 'FAILED', null, Date.now() - startedAt, code);
          if (error instanceof AiModelUnavailableError) {
            lastUnavailable = error;
            break;
          }
          throw error;
        }

        const latencyMs = Date.now() - startedAt;
        const cost = provider.estimateCostUsd(model, response.inputTokens, response.outputTokens);
        usage.attempts = attempt;
        usage.inputTokens += response.inputTokens;
        usage.outputTokens += response.outputTokens;
        usage.costUsd += cost;
        usage.latencyMs += latencyMs;

        const parsed = parseAnswer(response.text, request.schema);
        if (parsed.success) {
          await this.record(
            request,
            usage,
            attempt,
            'SUCCEEDED',
            { response, cost },
            latencyMs,
            null,
          );
          return { data: parsed.data as z.infer<T>, usage };
        }

        await this.record(
          request,
          usage,
          attempt,
          'INVALID_OUTPUT',
          { response, cost },
          latencyMs,
          'INVALID_OUTPUT',
        );
        if (tryOnModel === MAX_ATTEMPTS_PER_MODEL) {
          this.logger.warn(
            `AI answer for "${request.task}" was invalid after ${MAX_ATTEMPTS_PER_MODEL} attempts (${model}).`,
          );
          throw new AiInvalidOutputError();
        }
        // Second chance: show the model its answer and what was wrong with it (not logged anywhere).
        turns.push(
          { role: 'model', parts: [{ type: 'text', text: response.text }] },
          {
            role: 'user',
            parts: [
              {
                type: 'text',
                text:
                  'Your previous answer does not match the required JSON schema. Problems:\n' +
                  `${parsed.problems}\n` +
                  'Answer again with only the corrected JSON object, without any other text.',
              },
            ],
          },
        );
      }
    }

    this.logger.warn(`No model of the "${request.tier}" tier is available for "${request.task}".`);
    throw lastUnavailable ?? new AiInvalidOutputError();
  }

  /**
   * The user's model for the tier (RF-CONF-09) followed by the defaults, which are also the
   * fallbacks if the chosen model is retired. A choice that cannot be read is ignored.
   */
  private async modelsFor(providerId: AiProvider, tier: ModelTier): Promise<string[]> {
    const defaults = this.providers.get(providerId)!.modelsFor(tier);
    let chosen: string | undefined;
    try {
      chosen = (await this.choices.get(providerId))[tier];
    } catch (error) {
      this.logger.error(
        `Could not read the AI model choice: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return chosen ? [chosen, ...defaults.filter((model) => model !== chosen)] : defaults;
  }

  private async record(
    request: StructuredRequest<z.ZodType>,
    usage: LlmUsage,
    attempt: number,
    status: AiGenerationStatus,
    answered: { response: ProviderResponse; cost: number } | null,
    latencyMs: number,
    errorCode: string | null,
  ) {
    try {
      await this.generations.record({
        id: randomUUID(),
        task: request.task,
        provider: usage.provider,
        model: usage.model,
        promptVersion: request.prompt.id,
        attempt,
        status,
        inputTokens: answered?.response.inputTokens ?? 0,
        outputTokens: answered?.response.outputTokens ?? 0,
        costUsd: answered?.cost ?? 0,
        latencyMs,
        errorCode,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      // Usage logging must never break the AI feature itself.
      this.logger.error(
        `Could not record AI usage: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/** Parses the provider's text as JSON and validates it; problems are paths and rules, no values. */
function parseAnswer(
  text: string,
  schema: z.ZodType,
): { success: true; data: unknown } | { success: false; problems: string } {
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFence(text));
  } catch {
    return { success: false, problems: '- The answer is not valid JSON.' };
  }
  const result = schema.safeParse(json);
  if (result.success) return { success: true, data: result.data };
  const problems = result.error.issues
    .slice(0, 20)
    .map((issue) => `- ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  return { success: false, problems };
}

/** Some models wrap JSON in ``` fences even when asked for JSON only. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return match ? match[1]! : trimmed;
}

/** JSON Schema for the provider's structured output, without keys providers reject. */
export function toProviderJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(schema, {
    target: 'draft-7',
    unrepresentable: 'any',
  }) as Record<string, unknown>;
  return jsonSchema;
}
