import type { UiLanguage } from '@careerly/contracts';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resolveUiLanguage, systemLanguage } from './language';
import en from './locales/en.json';
import es from './locales/es.json';

export { SUPPORTED_LANGUAGES, type Language } from './language';

// Start in the system language; the saved preference is applied once settings load (see UiLanguageSync).
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: systemLanguage(navigator.language),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});
document.documentElement.lang = i18n.language;

/** Switches the interface language right away (no restart), following RF-CONF-08. */
export function applyUiLanguage(preference: UiLanguage | null) {
  const language = resolveUiLanguage(preference, navigator.language);
  document.documentElement.lang = language;
  if (i18n.language !== language) {
    void i18n.changeLanguage(language);
  }
}

export default i18n;
