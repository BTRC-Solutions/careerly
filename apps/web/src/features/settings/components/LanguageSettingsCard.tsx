import type { UiLanguage } from '@careerly/contracts';
import { useTranslation } from 'react-i18next';
import { systemLanguage } from '../../../shared/i18n/language';
import { Card } from '../../../shared/ui/Card';
import { InlineError } from '../../../shared/ui/InlineError';
import { useUpdateSettings } from '../api/useSettings';

type Choice = UiLanguage | 'system';

/** Language names are shown in their own language, so they are recognizable whatever the UI language. */
const LANGUAGE_NAMES: Record<UiLanguage, string> = { es: 'Español', en: 'English' };

export function LanguageSettingsCard({ value }: { value: UiLanguage | null }) {
  const { t } = useTranslation();
  const update = useUpdateSettings();
  // While a change is being saved, show the choice being saved (optimistic) so the selection
  // and keyboard focus follow the user immediately.
  const pending = update.isPending ? update.variables.uiLanguage : undefined;
  const current: Choice = (pending !== undefined ? pending : value) ?? 'system';

  const choices: { value: Choice; label: string }[] = [
    {
      value: 'system',
      label: t('settings.language.system', {
        language: LANGUAGE_NAMES[systemLanguage(navigator.language)],
      }),
    },
    { value: 'es', label: LANGUAGE_NAMES.es },
    { value: 'en', label: LANGUAGE_NAMES.en },
  ];

  function select(choice: Choice) {
    if (choice === current) return;
    update.mutate({ uiLanguage: choice === 'system' ? null : choice });
  }

  return (
    <Card>
      {/* Not disabled while saving: that would drop keyboard focus from the radio group. */}
      <fieldset aria-busy={update.isPending}>
        <legend className="text-section-title text-indigo-navy">
          {t('settings.language.title')}
        </legend>
        <p className="mt-1 text-sm text-steel-text">{t('settings.language.description')}</p>

        <div className="mt-4 flex flex-col gap-2">
          {choices.map((choice) => (
            <label
              key={choice.value}
              className="flex cursor-pointer items-center gap-3 rounded-control border border-silver-lining px-4 py-3 text-sm text-slate-ink transition-colors hover:bg-cloud-canvas has-checked:border-indigo-navy has-checked:bg-cloud-canvas"
            >
              <input
                type="radio"
                name="ui-language"
                value={choice.value}
                checked={current === choice.value}
                onChange={() => select(choice.value)}
                className="size-4 accent-indigo-navy"
              />
              {choice.label}
            </label>
          ))}
        </div>
      </fieldset>

      {update.isError && (
        <InlineError className="mt-3">
          {t('settings.language.saveError', { message: update.error.message })}
        </InlineError>
      )}
    </Card>
  );
}
