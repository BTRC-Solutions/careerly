import { z } from 'zod';

/** Supported AI providers (ADR-19). Gemini is implemented first; Claude follows. */
export const AiProviderSchema = z.enum(['gemini', 'anthropic']);
export type AiProvider = z.infer<typeof AiProviderSchema>;

/**
 * An API key as the user pastes it. Only the shape is checked here; whether it works is
 * verified against the provider (RF-CONF-02). Never logged, never stored in plain text (RNF-03).
 */
export const AiApiKeySchema = z
  .string()
  .trim()
  .min(10)
  .max(500)
  .regex(/^\S+$/, 'The API key cannot contain spaces.');

/**
 * Which providers have a saved key and which one is active. This is everything the interface can
 * know about the keys: the keys themselves never leave the main process and the backend.
 */
export const AiKeyStatusSchema = z.object({
  activeProvider: AiProviderSchema.nullable(),
  configured: z.record(AiProviderSchema, z.boolean()),
  /** `false` when the OS offers no secure storage: keys cannot be saved (they would be unprotected). */
  secureStorageAvailable: z.boolean(),
});
export type AiKeyStatus = z.infer<typeof AiKeyStatusSchema>;

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
