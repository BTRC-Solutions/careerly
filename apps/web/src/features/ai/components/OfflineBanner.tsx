import { useTranslation } from 'react-i18next';
import { useOnline } from '../../../shared/lib/useOnline';

/** Shown while there is no connection: everything but AI keeps working (RNF-13). */
export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnline();
  if (online) return null;
  return (
    <p
      role="status"
      className="border-b border-silver-lining bg-cloud-canvas px-6 py-2 text-sm text-slate-ink"
    >
      {t('ai.offlineBanner')}
    </p>
  );
}
