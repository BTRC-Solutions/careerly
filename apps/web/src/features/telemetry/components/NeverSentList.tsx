import { useTranslation } from 'react-i18next';

const NEVER_SENT = ['resume', 'personal', 'companies', 'jobPostings', 'ai'] as const;

/** What telemetry never includes, stated explicitly wherever telemetry is shown (RF-TEL-02). */
export function NeverSentList() {
  const { t } = useTranslation();
  return (
    <div className="rounded-control border border-silver-lining bg-cloud-canvas px-4 py-3">
      <p className="text-sm font-medium text-indigo-navy">{t('telemetry.neverSent.title')}</p>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-slate-ink">
        {NEVER_SENT.map((item) => (
          <li key={item}>{t(`telemetry.neverSent.${item}`)}</li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-steel-text">{t('telemetry.retention')}</p>
    </div>
  );
}
