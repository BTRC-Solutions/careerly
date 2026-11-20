import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ChevronLeftIcon } from '../../../shared/ui/icons';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { PrivacyCard } from '../../telemetry/components/PrivacyCard';
import { useSettings } from '../api/useSettings';
import { AiDataCard, LocalDataCard } from '../components/PrivacySections';

/**
 * Privacy (roadmap 8.4, RNF-01, RNF-02, RF-TEL-02): what stays on this computer, what goes to the AI provider,
 * what the logs keep, and the usage statistics with what they never include.
 */
export function PrivacyPage() {
  const { t } = useTranslation();
  const settings = useSettings();

  return (
    <div className="flex max-w-[45rem] flex-col gap-8">
      <Link
        to="/settings"
        className="inline-flex w-fit items-center gap-1 text-sm text-steel-text hover:text-indigo-navy"
      >
        <ChevronLeftIcon />
        {t('privacy.back')}
      </Link>
      <PageHeader title={t('privacy.title')} description={t('privacy.description')} />
      <LocalDataCard dataDir={settings.data?.dataDir} />
      <AiDataCard />
      <PrivacyCard />
    </div>
  );
}
