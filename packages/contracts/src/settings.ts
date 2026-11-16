import { z } from 'zod';

/** Interface languages (RF-CONF-08). */
export const UiLanguageSchema = z.enum(['es', 'en']);
export type UiLanguage = z.infer<typeof UiLanguageSchema>;

/**
 * Non-secret user preferences (RF-CONF-08). The AI API key is never part of these.
 * A `null` value means the user has not chosen yet (e.g. follow the system language).
 */
export const PreferencesSchema = z.object({
  uiLanguage: UiLanguageSchema.nullable(),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

/** `GET /settings` and `PATCH /settings` response. */
export const SettingsResponseSchema = z.object({
  preferences: PreferencesSchema,
  /** Absolute path of the local data folder (RF-CONF-03). Read-only. */
  dataDir: z.string(),
  /** Whether the backend holds an AI API key (RF-CONF-01). The key itself is never returned. */
  aiKey: z.object({ configured: z.boolean() }),
});
export type SettingsResponse = z.infer<typeof SettingsResponseSchema>;

/** `PATCH /settings` body: only the preferences to change. Unknown keys are rejected. */
export const UpdateSettingsRequestSchema = PreferencesSchema.partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'At least one preference must be provided.',
  });
export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequestSchema>;

/**
 * `POST /settings/ai-key/verify` body (RF-CONF-02). Without `apiKey`, the key the backend already holds
 * is verified; with it, a candidate key is checked before Electron stores it. The key is never persisted
 * by the backend and never echoed back.
 */
export const VerifyAiKeyRequestSchema = z
  .object({
    apiKey: z
      .string()
      .trim()
      .min(1, 'The API key is empty.')
      .max(512, 'The API key is too long.')
      .regex(/^\S+$/, 'The API key cannot contain spaces.')
      .optional(),
  })
  .strict();
export type VerifyAiKeyRequest = z.infer<typeof VerifyAiKeyRequestSchema>;

/**
 * Outcome of the test call to the AI provider:
 * - `VALID`: the provider accepted the key.
 * - `INVALID`: the provider rejected it (wrong, revoked or without permissions).
 * - `NOT_CONFIGURED`: no key was sent and the backend holds none.
 * - `UNREACHABLE`: no answer from the provider (offline, timeout or provider error); the key may be fine.
 */
export const AiKeyStatusSchema = z.enum(['VALID', 'INVALID', 'NOT_CONFIGURED', 'UNREACHABLE']);
export type AiKeyStatus = z.infer<typeof AiKeyStatusSchema>;

/** `POST /settings/ai-key/verify` response. */
export const VerifyAiKeyResponseSchema = z.object({
  status: AiKeyStatusSchema,
});
export type VerifyAiKeyResponse = z.infer<typeof VerifyAiKeyResponseSchema>;
