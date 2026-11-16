import type { ModelFacts } from '../application/llm.types.js';

/**
 * What Careerly knows about Claude models (RF-CONF-09): price in USD per million tokens (standard
 * API rates; thinking is billed as output), recommendation and whether it was tried with Careerly's
 * structured output. Prices are only used to show an estimated cost (RNF-06, D-02: informative,
 * never billing). Claude Haiku 5.5 costs more above 100K input tokens ($0.50 / $2.50); CVs and
 * job posts stay well below that.
 *
 * Source: Anthropic's pricing, checked in November 2026. Models missing here can still be chosen:
 * their cost is recorded as 0, with a warning in the log.
 */
const CATALOG: Record<string, ModelFacts> = {
  'claude-haiku-5-5': {
    inputUsdPerMTok: 0.1,
    outputUsdPerMTok: 0.5,
    recommendedFor: ['small'],
    tested: false,
  },
  'claude-sonnet-5-5': {
    inputUsdPerMTok: 2,
    outputUsdPerMTok: 10,
    recommendedFor: [],
    tested: false,
  },
  'claude-opus-5-5': {
    inputUsdPerMTok: 4,
    outputUsdPerMTok: 20,
    recommendedFor: ['large'],
    tested: false,
  },
  'claude-fable-5-2': {
    inputUsdPerMTok: 8,
    outputUsdPerMTok: 40,
    recommendedFor: [],
    tested: false,
  },
};

export function anthropicModelFacts(model: string): ModelFacts | undefined {
  return CATALOG[model];
}

export function estimateAnthropicCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const facts = CATALOG[model];
  if (!facts) return 0;
  return (inputTokens * facts.inputUsdPerMTok + outputTokens * facts.outputUsdPerMTok) / 1_000_000;
}

/**
 * Models that can answer through server-side refusal fallbacks (`fallbacks: "default"`): if a
 * safety classifier declines, the API retries the same request on another model in the same call.
 */
export function supportsRefusalFallback(model: string): boolean {
  return /^claude-(opus-5-5|sonnet-5-5|fable-5-[12]|opus-5)$/.test(model);
}

/**
 * Claude's structured outputs accept a subset of JSON Schema: every object needs
 * `additionalProperties: false`, and numeric/length constraints are not supported. Careerly
 * validates the answer with Zod afterwards, so dropping them here loses nothing.
 */
export function toClaudeJsonSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toClaudeJsonSchema);
  if (schema === null || typeof schema !== 'object') return schema;
  const UNSUPPORTED = new Set([
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'multipleOf',
    'minLength',
    'maxLength',
    'pattern',
    'minItems',
    'maxItems',
    'uniqueItems',
    '$schema',
  ]);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (UNSUPPORTED.has(key)) continue;
    result[key] =
      key === 'properties' && value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value).map(([name, child]) => [name, toClaudeJsonSchema(child)]),
          )
        : toClaudeJsonSchema(value);
  }
  if (result.type === 'object') result.additionalProperties = false;
  return result;
}
