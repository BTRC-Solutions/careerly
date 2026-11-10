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
});
export type SettingsResponse = z.infer<typeof SettingsResponseSchema>;

/** `PATCH /settings` body: only the preferences to change. Unknown keys are rejected. */
export const UpdateSettingsRequestSchema = PreferencesSchema.partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'At least one preference must be provided.',
  });
export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequestSchema>;
