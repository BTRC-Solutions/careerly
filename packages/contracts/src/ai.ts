import { z } from 'zod';

/** Supported AI providers (ADR-23). Gemini is implemented first; Claude follows. */
export const AiProviderSchema = z.enum(['gemini', 'anthropic']);
export type AiProvider = z.infer<typeof AiProviderSchema>;

/**
 * An API key as the user pastes it. Only the shape is checked here; whether it works is
 * verified against the provider (RF-CONF-02). Never logged, never stored in plain text (RNF-03).
 */
export const AiApiKeySchema = z
  .string()
  .trim()
  .min(10, 'The API key is too short.')
  .max(512, 'The API key is too long.')
  .regex(/^\S+$/, 'The API key cannot contain spaces.');

/**
 * Which providers have a saved key and which one is active. This is everything the interface can
 * know about the keys: the keys themselves never leave the main process and the backend.
 */
export const AiKeysStatusSchema = z.object({
  activeProvider: AiProviderSchema.nullable(),
  configured: z.record(AiProviderSchema, z.boolean()),
  /** `false` when the OS offers no secure storage: keys cannot be saved (they would be unprotected). */
  secureStorageAvailable: z.boolean(),
});
export type AiKeysStatus = z.infer<typeof AiKeysStatusSchema>;

/**
 * `PUT /internal/ai-credentials`: main → backend only (control token), never the interface.
 * `null` means "no usable key": AI features are disabled until one is configured.
 */
export const AiCredentialsSchema = z
  .object({
    credentials: z
      .object({ provider: AiProviderSchema, apiKey: AiApiKeySchema })
      .strict()
      .nullable(),
  })
  .strict();
export type AiCredentials = z.infer<typeof AiCredentialsSchema>;

/**
 * What an AI call was for (`AiGeneration.task`). Usage is reported per task (RF-CONF-06) and the
 * model tier depends on it (ARCHITECTURE §7.3).
 */
export const AiTaskSchema = z.enum([
  /** Internal check that the active provider answers with valid structured output. */
  'smoke-test',
  /** RF-PROF-09: CV → draft master profile. */
  'cv-import',
  /** RF-JD-02. */
  'jd-analysis',
  /** RF-TAIL-02: evidence for non-tool requirements. */
  'evidence-match',
  /** Relevance score of achievements and projects. */
  'relevance-score',
  /** RF-TAIL-10/11: bullets and summary. */
  'resume-writing',
  /** RF-PROF-10. */
  'achievement-suggestion',
]);
export type AiTask = z.infer<typeof AiTaskSchema>;

/** Outcome of one AI call (one row per attempt in `AiGeneration`). */
export const AiGenerationStatusSchema = z.enum([
  /** The answer was valid JSON matching the expected schema. */
  'SUCCEEDED',
  /** The provider answered, but not with what was asked (bad JSON or wrong shape). */
  'INVALID_OUTPUT',
  /** No usable answer: network, timeout, rejected key, rate limit, blocked content, provider error. */
  'FAILED',
]);
export type AiGenerationStatus = z.infer<typeof AiGenerationStatusSchema>;
