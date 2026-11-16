import { useTranslation } from 'react-i18next';
import { Card } from '../../../shared/ui/Card';

/** Installed version (RF-CONF-13), the same one sent as `appVersion` in telemetry reports. */
export function AboutCard({ appVersion }: { appVersion: string }) {
  const { t } = useTranslation();

  return (
    <Card>
      <h2 className="text-section-title text-indigo-navy">{t('settings.about.title')}</h2>
      <dl className="mt-4 flex items-baseline justify-between gap-4 text-sm">
        <dt className="text-steel-text">{t('settings.about.version')}</dt>
        <dd className="font-mono text-[13px] text-charcoal">{appVersion}</dd>
      </dl>
    </Card>
  );
}
