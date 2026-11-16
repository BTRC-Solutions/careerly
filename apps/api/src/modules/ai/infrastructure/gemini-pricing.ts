/**
 * Gemini API prices in USD per million tokens (standard paid tier), used only to show an estimated
 * cost (RNF-06, D-02: informative, never billing). Thinking tokens are billed as output.
 * The free tier costs nothing but has other terms (ARCHITECTURE §14).
 *
 * Source: https://ai.google.dev/gemini-api/docs/pricing, checked in November 2026. Update this
 * table when the default models change (config: CAREERLY_GEMINI_MODELS_*). Models missing here are
 * recorded with cost 0 and a warning in the log.
 */
interface Price {
  input: number;
  output: number;
}

const PRICES: Record<string, Price> = {
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  // Standard rate. Google lists a promotional rate (half) until 2026-12-31; using the standard one
  // keeps the estimate on the safe side.
  'gemini-3.6-flash': { input: 1.5, output: 7.5 },
};

/** Estimated cost in USD; 0 when the model is not in the table (the caller logs it once). */
export function estimateGeminiCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = PRICES[model];
  if (!price) return 0;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

export function hasGeminiPrice(model: string): boolean {
  return model in PRICES;
}
