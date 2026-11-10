import { useTranslation } from 'react-i18next';
import { ServiceStatusCard } from '../components/ServiceStatusCard';

export function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-indigo-navy">
          {t('home.title')}
        </h1>
        <p className="mt-2 text-steel">{t('home.subtitle')}</p>
      </header>
      <ServiceStatusCard />
    </div>
  );
}
