import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../platform/config/app-config.js';
import {
  AiBlockedError,
  AiError,
  AiKeyRejectedError,
  AiModelUnavailableError,
  AiRateLimitedError,
  AiUnavailableError,
} from '../application/llm-errors.js';
import { LlmProvider } from '../application/llm.ports.js';
import type {
  LlmPart,
  LlmTurn,
  ModelFacts,
  ModelTier,
  ProviderRequest,
  ProviderResponse,
} from '../application/llm.types.js';
import {
  anthropicModelFacts,
  estimateAnthropicCostUsd,
  supportsRefusalFallback,
  toClaudeJsonSchema,
} from './anthropic-models.js';

/** Room for a whole CV as JSON plus the model's thinking (billed as output). */
const MAX_TOKENS = 32_000;
const REFUSAL_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * Claude over the Messages API with the official SDK (ADR-23). Structured output with
 * `output_config.format`, PDFs as document blocks, streaming so long answers are not cut by HTTP
 * timeouts. The key is only sent in the SDK's header; prompts, answers and error bodies are never
 * logged.
 */
@Injectable()
export class AnthropicLlmProvider extends LlmProvider {
  readonly id = 'anthropic' as const;
  private readonly logger = new Logger(AnthropicLlmProvider.name);
  private readonly warnedUnpriced = new Set<string>();

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
  }

  modelsFor(tier: ModelTier): string[] {
    return this.config.anthropicModels[tier];
  }

  describeModel(model: string): ModelFacts | undefined {
    return anthropicModelFacts(model);
  }

  estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
    if (!anthropicModelFacts(model) && !this.warnedUnpriced.has(model)) {
      this.warnedUnpriced.add(model);
      this.logger.warn(`No price known for ${model}: its cost is recorded as 0.`);
    }
    return estimateAnthropicCostUsd(model, inputTokens, outputTokens);
  }

  /** Claude models this key can use. */
  async listModels(apiKey: string): Promise<string[]> {
    const client = this.client(apiKey, 15_000);
    const ids: string[] = [];
    try {
      for await (const model of client.models.list({ limit: 100 })) {
        if (model.id.startsWith('claude-')) ids.push(model.id);
      }
    } catch (error) {
      throw this.toError(error, 'models.list');
    }
    return ids.sort();
  }

  async generateJson(request: ProviderRequest): Promise<ProviderResponse> {
    const client = this.client(request.apiKey, request.timeoutMs);
    const fallback = supportsRefusalFallback(request.model);
    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await client.beta.messages
        .stream({
          model: request.model,
          max_tokens: MAX_TOKENS,
          system: request.system,
          messages: request.turns.map(toClaudeMessage),
          output_config: {
            format: {
              type: 'json_schema',
              schema: toClaudeJsonSchema(request.jsonSchema) as Record<string, unknown>,
            },
          },
          // If a safety classifier declines, the API retries on another model in the same call.
          ...(fallback ? { betas: [REFUSAL_FALLBACK_BETA], fallbacks: 'default' as const } : {}),
        })
        .finalMessage();
    } catch (error) {
      throw this.toError(error, request.model);
    }

    if (message.stop_reason === 'refusal') throw new AiBlockedError('refusal');
    const text = message.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
    if (!text) throw new AiBlockedError(message.stop_reason ?? 'empty answer');

    return {
      text,
      inputTokens:
        message.usage.input_tokens +
        (message.usage.cache_creation_input_tokens ?? 0) +
        (message.usage.cache_read_input_tokens ?? 0),
      outputTokens: message.usage.output_tokens,
    };
  }

  private client(apiKey: string, timeout: number): Anthropic {
    // LlmClient handles retries and fallbacks between models; one SDK retry covers blips.
    return new Anthropic({
      apiKey,
      // Only the user's key: never a token or profile from the environment.
      authToken: null,
      baseURL: this.config.aiBaseUrls.anthropic,
      timeout,
      maxRetries: 1,
    });
  }

  private toError(error: unknown, model: string): AiError {
    if (error instanceof AiError) return error;
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError
    ) {
      return new AiKeyRejectedError();
    }
    if (error instanceof Anthropic.RateLimitError) return new AiRateLimitedError();
    if (error instanceof Anthropic.NotFoundError) {
      return new AiModelUnavailableError(model, 'not found');
    }
    if (error instanceof Anthropic.APIError && error.status === 529) {
      return new AiModelUnavailableError(model, 'overloaded');
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return new AiUnavailableError('network error or timeout');
    }
    if (error instanceof Anthropic.APIError) {
      // Status and Anthropic's error type only: never the body or the request.
      this.logger.warn(
        `Anthropic answered ${error.status ?? '?'} (${errorType(error)}) for ${model}.`,
      );
      return new AiUnavailableError(`HTTP ${error.status ?? '?'}`);
    }
    return new AiUnavailableError(error instanceof Error ? error.name : 'unknown error');
  }
}

function errorType(error: InstanceType<typeof Anthropic.APIError>): string {
  const body = error.error as { error?: { type?: unknown } } | undefined;
  return typeof body?.error?.type === 'string' ? body.error.type : 'no details';
}

/** Documents go before the text that refers to them. */
function toClaudeMessage(turn: LlmTurn): Anthropic.Beta.BetaMessageParam {
  const ordered = [
    ...turn.parts.filter((part) => part.type === 'document'),
    ...turn.parts.filter((part) => part.type === 'text'),
  ];
  return {
    role: turn.role === 'model' ? 'assistant' : 'user',
    content: ordered.map(toClaudeBlock),
  };
}

function toClaudeBlock(part: LlmPart): Anthropic.Beta.BetaContentBlockParam {
  return part.type === 'text'
    ? { type: 'text', text: part.text }
    : {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: part.data.toString('base64'),
        },
      };
}
