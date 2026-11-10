import { useEffect } from 'react';
import { applyUiLanguage } from '../../../shared/i18n';
import { useSettings } from '../api/useSettings';

/**
 * Keeps the interface language in sync with the saved preference.
 * Mounted once in the app layout; renders nothing. Until settings load (or if the API is down),
 * the interface stays in the system language.
 */
export function UiLanguageSync() {
  const uiLanguage = useSettings().data?.preferences.uiLanguage;

  useEffect(() => {
    if (uiLanguage !== undefined) {
      applyUiLanguage(uiLanguage);
    }
  }, [uiLanguage]);

  return null;
}
