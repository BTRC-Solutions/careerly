import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { cn } from '../../../shared/lib/cn';
import { useHealth } from '../api/useHealth';

export function ServiceStatusCard() {
  const { t } = useTranslation();
  const health = useHealth();

  const state = health.isPending ? 'checking' : health.isError ? 'error' : 'ok';

  return (
    <Card className="max-w-md">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-section-title text-indigo-navy">{t('home.status.title')}</h2>
        <p role="status" className="flex items-center gap-2 text-sm text-slate-ink">
          <span
            aria-hidden="true"
            className={cn(
              'size-2 rounded-full',
              state === 'ok' && 'bg-seafoam-600',
              state === 'error' && 'bg-signal-orange',
              state === 'checking' && 'bg-fog',
            )}
          />
          {t(`home.status.${state}`)}
        </p>
      </div>

      {health.data && (
        <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-2 text-sm">
          <dt className="text-steel-text">{t('home.status.version')}</dt>
          <dd className="font-mono text-[13px] text-charcoal">{health.data.version}</dd>
          <dt className="text-steel-text">{t('home.status.migrations')}</dt>
          <dd className="font-mono text-[13px] text-charcoal">
            {health.data.database.appliedMigrations}
          </dd>
        </dl>
      )}

      {health.isError && (
        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-sm text-steel-text">{health.error.message}</p>
          <Button variant="secondary" onClick={() => void health.refetch()}>
            {t('home.status.retry')}
          </Button>
        </div>
      )}
    </Card>
  );
}
