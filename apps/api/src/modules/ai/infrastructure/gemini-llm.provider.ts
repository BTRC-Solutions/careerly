import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../platform/config/app-config.js';
import {
  AiBlockedError,
  AiKeyRejectedError,
  AiModelUnavailableError,
  AiRateLimitedError,
  AiUnavailableError,
} from '../application/llm-errors.js';
import { LlmProvider } from '../application/llm.ports.js';
import type {
  LlmPart,
  ModelFacts,
  ModelTier,
  ProviderRequest,
  ProviderResponse,
} from '../application/llm.types.js';
import { estimateGeminiCostUsd, geminiModelFacts, isGeminiTextModel } from './gemini-models.js';

/** Finish reasons that mean the model refused or was stopped, not that it answered. */
const BLOCKING_FINISH_REASONS = new Set([
  'SAFETY',
  'RECITATION',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
  'LANGUAGE',
  'OTHER',
]);

interface GeminiResponseBody {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
}

interface GeminiErrorBody {
  error?: { status?: string; details?: { reason?: string }[] };
}

/**
 * Google Gemini over its REST API (`generateContent`), with JSON output constrained by a JSON
 * Schema (ADR-23). The key goes in the `x-goog-api-key` header, never in the URL. Prompts,
 * answers and error bodies are never logged; only HTTP status and Google's error codes.
 */
@Injectable()
export class GeminiLlmProvider extends LlmProvider {
  readonly id = 'gemini' as const;
  private readonly logger = new Logger(GeminiLlmProvider.name);
  private readonly warnedUnpriced = new Set<string>();

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
  }

  modelsFor(tier: ModelTier): string[] {
    return this.config.geminiModels[tier];
  }

  estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
    if (!geminiModelFacts(model) && !this.warnedUnpriced.has(model)) {
      this.warnedUnpriced.add(model);
      this.logger.warn(`No price known for ${model}: its cost is recorded as 0.`);
    }
    return estimateGeminiCostUsd(model, inputTokens, outputTokens);
  }

  describeModel(model: string): ModelFacts | undefined {
    return geminiModelFacts(model);
  }

  /** Text models that support `generateContent` for this key, without the `models/` prefix. */
  async listModels(apiKey: string): Promise<string[]> {
    const names: string[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 10; page++) {
      const query = new URLSearchParams({ pageSize: '100', ...(pageToken ? { pageToken } : {}) });
      let response: Response;
      try {
        response = await fetch(`${this.config.aiBaseUrls.gemini}/v1beta/models?${query}`, {
          headers: { 'x-goog-api-key': apiKey },
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new AiUnavailableError('network error');
      }
      if (!response.ok) throw await this.toError(response, 'models.list');
      const body = (await response.json()) as {
        models?: { name?: string; supportedGenerationMethods?: string[] }[];
        nextPageToken?: string;
      };
      for (const model of body.models ?? []) {
        const name = model.name?.replace(/^models\//, '');
        if (name && model.supportedGenerationMethods?.includes('generateContent')) {
          if (isGeminiTextModel(name)) names.push(name);
        }
      }
      pageToken = body.nextPageToken;
      if (!pageToken) break;
    }
    return names.sort();
  }

  async generateJson(request: ProviderRequest): Promise<ProviderResponse> {
    const url = `${this.config.aiBaseUrls.gemini}/v1beta/models/${encodeURIComponent(request.model)}:generateContent`;
    const body = {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: request.turns.map((turn) => ({
        role: turn.role,
        parts: turn.parts.map(toGeminiPart),
      })),
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: request.jsonSchema,
        // Extraction and structured writing should be as deterministic as the model allows.
        temperature: 0,
      },
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'x-goog-api-key': request.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(request.timeoutMs),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : 'unknown error';
      throw new AiUnavailableError(name === 'TimeoutError' ? 'timeout' : 'network error');
    }

    if (!response.ok) {
      throw await this.toError(response, request.model);
    }

    const result = (await response.json()) as GeminiResponseBody;
    const blockReason = result.promptFeedback?.blockReason;
    if (blockReason) throw new AiBlockedError(blockReason);

    const candidate = result.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .filter((part) => !part.thought && typeof part.text === 'string')
      .map((part) => part.text)
      .join('');
    const finishReason = candidate?.finishReason;
    if (!text) throw new AiBlockedError(finishReason ?? 'empty answer');
    if (finishReason && BLOCKING_FINISH_REASONS.has(finishReason)) {
      throw new AiBlockedError(finishReason);
    }

    const usage = result.usageMetadata ?? {};
    return {
      text,
      inputTokens: usage.promptTokenCount ?? 0,
      outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
    };
  }

  /** Maps an error response using only Google's status codes; the body text is never kept. */
  private async toError(response: Response, model: string): Promise<Error> {
    let status: string | undefined;
    let reasons: string[] = [];
    try {
      const body = (await response.json()) as GeminiErrorBody;
      status = body.error?.status;
      reasons = (body.error?.details ?? []).flatMap((detail) =>
        detail.reason ? [detail.reason] : [],
      );
    } catch {
      // Not JSON: the HTTP status is enough.
    }

    if (
      response.status === 401 ||
      response.status === 403 ||
      reasons.some((reason) => reason.startsWith('API_KEY_'))
    ) {
      return new AiKeyRejectedError();
    }
    if (response.status === 429) return new AiRateLimitedError();

    this.logger.warn(
      `Gemini answered ${response.status} (${[status, ...reasons].filter(Boolean).join(', ') || 'no details'}) for ${model}.`,
    );
    if (response.status === 404) return new AiModelUnavailableError(model, 'not found');
    if (response.status === 503) return new AiModelUnavailableError(model, 'overloaded');
    return new AiUnavailableError(`HTTP ${response.status}`);
  }
}

function toGeminiPart(part: LlmPart) {
  return part.type === 'text'
    ? { text: part.text }
    : { inlineData: { mimeType: part.mimeType, data: part.data.toString('base64') } };
}
