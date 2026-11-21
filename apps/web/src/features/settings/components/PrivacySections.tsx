import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Card } from '../../../shared/ui/Card';

const LOCAL_ITEMS = ['data', 'key', 'logs'] as const;
const AI_FUNCTIONS = ['jdAnalysis', 'cvImport', 'suggestion', 'tailoring'] as const;
const NEVER_TO_AI = ['contact', 'applications', 'telemetry'] as const;

/** Privacy in Settings, with a link to the privacy screen (roadmap 8.4). */
export function PrivacyLinkCard() {
  const { t } = useTranslation();
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-section-title text-indigo-navy">{t('privacy.card.title')}</h2>
          <p className="mt-1 text-sm text-steel-text">{t('privacy.card.description')}</p>
        </div>
        <Link
          to="/settings/privacy"
          className="shrink-0 text-sm font-medium text-indigo-navy underline-offset-4 hover:underline"
        >
          {t('privacy.card.open')}
        </Link>
      </div>
    </Card>
  );
}

/** What stays on this computer and where (RNF-01, RNF-02, RNF-03). */
export function LocalDataCard({ dataDir }: { dataDir: string | undefined }) {
  const { t } = useTranslation();
  return (
    <Card>
      <h2 className="text-section-title text-indigo-navy">{t('privacy.local.title')}</h2>
      <p className="mt-1 text-sm text-steel-text">{t('privacy.local.description')}</p>
      {dataDir && (
        <p className="mt-4 rounded-control border border-silver-lining bg-cloud-canvas px-4 py-3 font-mono text-[13px] break-all text-charcoal">
          {dataDir}
        </p>
      )}
      <ul className="mt-4 flex list-disc flex-col gap-2 pl-5 text-sm text-slate-ink">
        {LOCAL_ITEMS.map((item) => (
          <li key={item}>{t(`privacy.local.${item}`)}</li>
        ))}
      </ul>
    </Card>
  );
}

/** What each AI function sends to the provider, and what never goes (RNF-01). */
export function AiDataCard() {
  const { t } = useTranslation();
  return (
    <Card>
      <h2 className="text-section-title text-indigo-navy">{t('privacy.ai.title')}</h2>
      <p className="mt-1 text-sm text-steel-text">{t('privacy.ai.description')}</p>
      <dl className="mt-4 flex flex-col divide-y divide-silver-lining rounded-control border border-silver-lining">
        {AI_FUNCTIONS.map((item) => (
          <div key={item} className="px-4 py-3">
            <dt className="text-sm font-medium text-indigo-navy">
              {t(`privacy.ai.functions.${item}.name`)}
            </dt>
            <dd className="mt-1 text-sm text-slate-ink">
              {t(`privacy.ai.functions.${item}.sends`)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 rounded-control border border-silver-lining bg-cloud-canvas px-4 py-3">
        <p className="text-sm font-medium text-indigo-navy">{t('privacy.ai.never.title')}</p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-slate-ink">
          {NEVER_TO_AI.map((item) => (
            <li key={item}>{t(`privacy.ai.never.${item}`)}</li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
