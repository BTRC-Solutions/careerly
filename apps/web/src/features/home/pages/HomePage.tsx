import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { ApplicationsSummaryCard } from '../../dashboard/components/ApplicationsSummaryCard';
import { OpenSessionsCard } from '../../tailoring/components/OpenSessionsCard';
import { ServiceStatusCard } from '../components/ServiceStatusCard';

export function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="flex max-w-[45rem] flex-col gap-8">
      <PageHeader title={t('home.title')} description={t('home.subtitle')} />
      <ApplicationsSummaryCard />
      <OpenSessionsCard />
      <ServiceStatusCard />
    </div>
  );
}
