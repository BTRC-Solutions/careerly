import { z } from 'zod';

/** AI providers used with the user's API key (ADR-23): the keys Electron stores and verifies. */
export const AiProviderSchema = z.enum(['gemini', 'anthropic']);
export type AiProvider = z.infer<typeof AiProviderSchema>;

/**
 * What generates the answers: a provider with an API key, or `claude-code`, the Claude Code
 * installed and logged in on this computer, with the user's Claude subscription instead of a key
 * (RF-CONF-14, ADR-25; optional, personal use).
 */
export const LlmProviderIdSchema = z.enum([...AiProviderSchema.options, 'claude-code']);
export type LlmProviderId = z.infer<typeof LlmProviderIdSchema>;

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

// ---------------------------------------------------------------------------
// Model choice (RF-CONF-09, ADR-23)
// ---------------------------------------------------------------------------

/** Small model for extraction and scoring, large model for writing (ARCHITECTURE §7.3). */
export const ModelTierSchema = z.enum(['small', 'large']);
export type ModelTier = z.infer<typeof ModelTierSchema>;

/** A provider's model id, e.g. `gemini-3.5-flash-lite`. */
export const AiModelIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/, 'Invalid model id.');

/** A model the active key can use, with what Careerly knows about it. */
export const AiModelOptionSchema = z.object({
  id: AiModelIdSchema,
  /** `false` for a chosen model the provider no longer offers (calls fall back to the defaults). */
  available: z.boolean(),
  /** USD per million tokens; `null` when the price is not known. */
  inputUsdPerMTok: z.number().nullable(),
  outputUsdPerMTok: z.number().nullable(),
  /** Tiers this model is recommended for. */
  recommendedFor: z.array(ModelTierSchema),
  /** Tried with Careerly's structured output. Models outside the catalog are not. */
  tested: z.boolean(),
});
export type AiModelOption = z.infer<typeof AiModelOptionSchema>;

export const AiModelTierSchema = z.object({
  /** The user's choice, or `null` to use the defaults. */
  selected: AiModelIdSchema.nullable(),
  /** Default models in order of preference; also the fallbacks of the chosen one. */
  defaults: z.array(AiModelIdSchema),
});
export type AiModelTier = z.infer<typeof AiModelTierSchema>;

/** `GET /settings/ai-models`: models of the active provider and the choice per tier. */
export const AiModelsResponseSchema = z.object({
  provider: LlmProviderIdSchema,
  tiers: z.record(ModelTierSchema, AiModelTierSchema),
  models: z.array(AiModelOptionSchema),
});
export type AiModelsResponse = z.infer<typeof AiModelsResponseSchema>;

/**
 * `PUT /settings/ai-models`: chooses the model of a tier (tested with a minimal call before saving)
 * or, with `model: null`, goes back to the defaults.
 */
export const UpdateAiModelRequestSchema = z
  .object({ tier: ModelTierSchema, model: AiModelIdSchema.nullable() })
  .strict();
export type UpdateAiModelRequest = z.infer<typeof UpdateAiModelRequestSchema>;

// ---------------------------------------------------------------------------
// Claude Code with the user's subscription (RF-CONF-14, ADR-25)
// ---------------------------------------------------------------------------

/**
 * Why Claude Code cannot be used right now:
 * - `NOT_INSTALLED`: no `claude` command was found.
 * - `NOT_LOGGED_IN`: it is installed but not signed in (`claude auth login`).
 * - `CHECK_FAILED`: it did not answer the status check.
 */
export const ClaudeCodeProblemSchema = z.enum(['NOT_INSTALLED', 'NOT_LOGGED_IN', 'CHECK_FAILED']);
export type ClaudeCodeProblem = z.infer<typeof ClaudeCodeProblemSchema>;

/** `GET /settings/claude-code` and `PUT /settings/claude-code` response. */
export const ClaudeCodeStatusSchema = z.object({
  /** The user turned it on: AI calls go to Claude Code instead of the API key. */
  enabled: z.boolean(),
  /** Installed and signed in, so it can be used. */
  ready: z.boolean(),
  problem: ClaudeCodeProblemSchema.nullable(),
  /** e.g. `2.1.318`, when installed. */
  version: z.string().nullable(),
  /** How it is signed in, as Claude Code reports it (e.g. `claude.ai`), when known. */
  authMethod: z.string().nullable(),
});
export type ClaudeCodeStatus = z.infer<typeof ClaudeCodeStatusSchema>;

/** `PUT /settings/claude-code`: turning it on is refused (not saved) unless it is ready. */
export const UpdateClaudeCodeRequestSchema = z.object({ enabled: z.boolean() }).strict();
export type UpdateClaudeCodeRequest = z.infer<typeof UpdateClaudeCodeRequestSchema>;
