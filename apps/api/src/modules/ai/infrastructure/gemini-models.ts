import type { ModelFacts } from '../application/llm.types.js';

/**
 * What Careerly knows about Gemini models (RF-CONF-09): price in USD per million tokens (standard
 * paid tier), the tiers each one is recommended for and whether it was tried with Careerly's
 * structured output. Prices are only used to show an estimated cost (RNF-06, D-02: informative,
 * never billing). Thinking tokens are billed as output. The free tier costs nothing but has other
 * terms (ARCHITECTURE §14).
 *
 * Source: https://ai.google.dev/gemini-api/docs/pricing, checked in November 2026. Update this
 * table when the default models change (config: CAREERLY_GEMINI_MODELS_*). Models missing here can
 * still be chosen: their cost is recorded as 0, with a warning in the log.
 */
const CATALOG: Record<string, ModelFacts> = {
  'gemini-3.5-flash-lite': {
    inputUsdPerMTok: 0.3,
    outputUsdPerMTok: 2.5,
    recommendedFor: ['small'],
    tested: true,
  },
  // Standard rate. Google lists a promotional rate (half) until 2026-12-31; using the standard one
  // keeps the estimate on the safe side.
  'gemini-3.6-flash': {
    inputUsdPerMTok: 1.5,
    outputUsdPerMTok: 7.5,
    recommendedFor: ['large'],
    tested: true,
  },
};

export function geminiModelFacts(model: string): ModelFacts | undefined {
  return CATALOG[model];
}

/** Estimated cost in USD; 0 when the model is not in the table (the caller logs it once). */
export function estimateGeminiCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const facts = CATALOG[model];
  if (!facts) return 0;
  return (inputTokens * facts.inputUsdPerMTok + outputTokens * facts.outputUsdPerMTok) / 1_000_000;
}

/**
 * Models listed for `generateContent` that cannot answer Careerly's text tasks (speech, images,
 * embeddings, live audio): they are left out of the choice.
 */
export function isGeminiTextModel(model: string): boolean {
  return !/(tts|image|embedding|audio|live|veo|imagen)/.test(model);
}
