import {
  type PageBudget,
  type ResumeLanguage,
  ResumeLanguageSchema,
  type TailoringSession,
} from '@careerly/contracts';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../shared/ui/Card';
import { Checkbox, Field, Select } from '../../../shared/ui/form';
import { InlineError } from '../../../shared/ui/InlineError';
import { useTemplates } from '../../templates/api/templates-api';
import { useUpdateTailoringOptions } from '../api/tailoring-api';

const PAGE_BUDGETS: PageBudget[] = [1, 2];

/**
 * The CV options of a session: output languages, page limit and template (RF-TAIL-07 to RF-TAIL-09). Each
 * change is saved at once and applies to the next generation; they cannot change while generating or once
 * the session is finalized.
 */
export function SessionOptionsCard({ session }: { session: TailoringSession }) {
  const { t } = useTranslation();
  const update = useUpdateTailoringOptions(session.id);
  const templates = useTemplates();
  const locked = session.status === 'GENERATING' || session.status === 'FINALIZED';
  const disabled = locked || update.isPending;

  const toggleLanguage = (language: ResumeLanguage, checked: boolean) => {
    const languages = ResumeLanguageSchema.options.filter((option) =>
      option === language ? checked : session.languages.includes(option),
    );
    update.mutate({ languages });
  };

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-section-title text-indigo-navy">{t('tailoring.options.title')}</h2>
        <p className="mt-1 text-sm text-steel-text">
          {locked ? t('tailoring.options.locked') : t('tailoring.options.description')}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-slate-ink">
            {t('tailoring.options.languages')}
          </legend>
          {ResumeLanguageSchema.options.map((language) => {
            const checked = session.languages.includes(language);
            return (
              <Checkbox
                key={language}
                label={t(`tailoring.options.languageNames.${language}`)}
                checked={checked}
                // At least one language: the last one cannot be unchecked.
                disabled={disabled || (checked && session.languages.length === 1)}
                onChange={(event) => toggleLanguage(language, event.target.checked)}
              />
            );
          })}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-slate-ink">
            {t('tailoring.options.pages')}
          </legend>
          {PAGE_BUDGETS.map((pages) => (
            <label key={pages} className="inline-flex items-center gap-2 text-sm text-slate-ink">
              <input
                type="radio"
                name={`page-budget-${session.id}`}
                checked={session.pageBudget === pages}
                disabled={disabled}
                onChange={() => update.mutate({ pageBudget: pages })}
                className="size-4 accent-indigo-navy"
              />
              {t('tailoring.options.pageCount', { count: pages })}
            </label>
          ))}
          <p className="text-xs text-steel-text">{t('tailoring.options.pagesHint')}</p>
        </fieldset>

        <Field label={t('tailoring.options.template')}>
          {(control) => (
            <Select
              {...control}
              value={session.templateId}
              disabled={disabled || !templates.data}
              onChange={(event) => update.mutate({ templateId: event.target.value })}
            >
              {(templates.data ?? []).map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
              {/* The session's template while the list loads, or if it was deleted since. */}
              {!templates.data?.some((template) => template.id === session.templateId) && (
                <option value={session.templateId}>{session.templateId}</option>
              )}
            </Select>
          )}
        </Field>
      </div>

      {update.error && (
        <InlineError>{t('common.saveError', { message: update.error.message })}</InlineError>
      )}
    </Card>
  );
}
