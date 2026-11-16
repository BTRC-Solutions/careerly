import type { PromptVersion } from '../llm.types.js';

/**
 * Smallest possible structured call: proves that the active provider, key, model and JSON-schema
 * output work end to end. Prompts are versioned files (ARCHITECTURE §7.3): never edit a released
 * version in place; add `smoke-test.v2.ts` instead.
 */
export const SMOKE_TEST_V1: PromptVersion = {
  id: 'smoke-test.v1',
  system:
    'You are a health check for a desktop app. Answer only with a JSON object that matches the ' +
    'provided schema. Do not add explanations.',
};
