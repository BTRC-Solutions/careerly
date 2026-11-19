import type { ResumeLanguage } from '@careerly/contracts';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../shared/lib/cn';

/** Switches between the CVs of a session, one per language; nothing to switch with a single one. */
export function LanguageToggle({
  languages,
  value,
  onChange,
}: {
  languages: ResumeLanguage[];
  value: ResumeLanguage;
  onChange: (language: ResumeLanguage) => void;
}) {
  const { t } = useTranslation();
  if (languages.length < 2) return null;
  return (
    <div
      role="group"
      aria-label={t('tailoring.review.language')}
      className="flex w-fit rounded-control border border-silver-lining p-0.5"
    >
      {languages.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
          className={cn(
            'rounded-[6px] px-3 py-1 text-sm font-medium transition-colors',
            option === value
              ? 'bg-indigo-navy text-pure-white'
              : 'text-steel-text hover:text-indigo-navy',
          )}
        >
          {t(`tailoring.review.languages.${option}`)}
        </button>
      ))}
    </div>
  );
}
