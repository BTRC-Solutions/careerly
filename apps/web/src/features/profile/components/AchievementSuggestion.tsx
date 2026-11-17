import type { AchievementSuggestion as Suggestion } from '@careerly/contracts';
import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../../shared/api/client';
import { Button } from '../../../shared/ui/Button';
import { InlineError } from '../../../shared/ui/InlineError';
import { useAiAvailability } from '../../ai/useAiAvailability';
import { useSuggestAchievement } from '../api/profile-api';
import type { AchievementFormSchema } from '../lib/form-schemas';

/** API error codes with their own message; anything else gets the generic one. */
const KNOWN_ERRORS = new Set([
  'AI_NOT_CONFIGURED',
  'AI_KEY_REJECTED',
  'AI_RATE_LIMITED',
  'AI_UNAVAILABLE',
  'AI_UNFAITHFUL',
]);

type AchievementForm = UseFormReturn<
  z.input<typeof AchievementFormSchema>,
  unknown,
  z.output<typeof AchievementFormSchema>
>;

/**
 * Wording suggestion for the achievement being edited (RF-PROF-10). Accepting copies it into the form, which
 * still has to be saved; discarding leaves the form as it was. The profile never changes from here.
 */
export function AchievementSuggestion({ form }: { form: AchievementForm }) {
  const { t } = useTranslation();
  const ai = useAiAvailability();
  const suggest = useSuggestAchievement();
  const [suggestion, setSuggestion] = useState<Suggestion>();
  const text = form.watch('text');

  async function ask() {
    setSuggestion(undefined);
    try {
      setSuggestion(
        await suggest.mutateAsync({ text, metrics: form.getValues('metrics') || null }),
      );
    } catch {
      // Shown below through `suggest.error`.
    }
  }

  function accept() {
    if (!suggestion) return;
    form.setValue('text', suggestion.text, { shouldDirty: true, shouldValidate: true });
    form.setValue('metrics', suggestion.metrics ?? '', { shouldDirty: true });
    setSuggestion(undefined);
    suggest.reset();
  }

  const errorCode =
    suggest.error instanceof ApiError && KNOWN_ERRORS.has(suggest.error.code)
      ? suggest.error.code
      : 'AI_FAILED';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          disabled={!text?.trim() || suggest.isPending || !ai.available}
          onClick={() => void ask()}
        >
          {suggest.isPending
            ? t('profile.achievements.suggestion.pending')
            : t('profile.achievements.suggestion.ask')}
        </Button>
        {ai.reason && (
          <span className="text-sm text-steel-text">{t(`ai.unavailable.${ai.reason}`)}</span>
        )}
      </div>

      {suggest.isError && (
        <InlineError>{t(`profile.achievements.suggestion.errors.${errorCode}`)}</InlineError>
      )}

      {suggestion && (
        <section
          aria-label={t('profile.achievements.suggestion.title')}
          className="rounded-control border border-silver-lining bg-pure-white p-3"
        >
          <h4 className="text-sm font-medium text-indigo-navy">
            {t('profile.achievements.suggestion.title')}
          </h4>
          <p className="mt-2 text-sm whitespace-pre-wrap text-slate-ink">{suggestion.text}</p>
          {suggestion.metrics && (
            <p className="mt-1 font-mono text-[13px] text-seafoam-700">{suggestion.metrics}</p>
          )}
          {suggestion.questions.length > 0 && (
            <div className="mt-3">
              <p className="text-sm text-steel-text">
                {t('profile.achievements.suggestion.questions')}
              </p>
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-ink">
                {suggestion.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSuggestion(undefined)}>
              {t('profile.achievements.suggestion.discard')}
            </Button>
            <Button variant="secondary" size="sm" onClick={accept}>
              {t('profile.achievements.suggestion.accept')}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
