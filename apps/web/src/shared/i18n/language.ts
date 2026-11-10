import type { UiLanguage } from '@careerly/contracts';

export const SUPPORTED_LANGUAGES = ['es', 'en'] as const satisfies readonly UiLanguage[];
export type Language = UiLanguage;

/** The supported language closest to the system one (`navigator.language`). Defaults to English. */
export function systemLanguage(navigatorLanguage: string | undefined): Language {
  return navigatorLanguage?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

/**
 * The language the interface must use (RF-CONF-08):
 * the saved preference, or the system language while the user has not chosen one (`null`).
 */
export function resolveUiLanguage(
  preference: UiLanguage | null | undefined,
  navigatorLanguage: string | undefined,
): Language {
  return preference ?? systemLanguage(navigatorLanguage);
}
