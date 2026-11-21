import {
  type ApplicationStatus,
  ApplicationStatusSchema,
  type DashboardPeriod,
  DashboardPeriodSchema,
  type DashboardSummary,
} from '@careerly/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { cn } from '../../../shared/lib/cn';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { InlineError } from '../../../shared/ui/InlineError';
import { useDashboardSummary } from '../api/dashboard-api';

/**
 * The applications at a glance (roadmap 8.1): how many there are in each state (RF-DASH-01), the response rate
 * and the median days to the first answer of those sent in the period (RF-DASH-02).
 */
export function ApplicationsSummaryCard() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<DashboardPeriod>('all');
  const summary = useDashboardSummary(period);

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-section-title text-indigo-navy">{t('dashboard.title')}</h2>
        {summary.data && summary.data.total > 0 && (
          <PeriodPicker value={period} onChange={setPeriod} />
        )}
      </div>

      {summary.isPending && (
        <p role="status" className="text-sm text-steel-text">
          {t('dashboard.loading')}
        </p>
      )}
      {summary.isError && (
        <div className="flex flex-col items-start gap-4">
          <InlineError>{t('dashboard.loadError')}</InlineError>
          <Button variant="secondary" onClick={() => void summary.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      )}
      {summary.data &&
        (summary.data.total === 0 ? (
          <p className="text-sm text-steel-text">
            {t('dashboard.empty')}{' '}
            <Link
              to="/job-postings"
              className="font-medium text-slate-ink underline decoration-silver-lining underline-offset-2 hover:text-indigo-navy hover:decoration-indigo-navy"
            >
              {t('dashboard.emptyAction')}
            </Link>
          </p>
        ) : (
          <>
            <ResponseMetrics summary={summary.data} />
            <StatusCounts summary={summary.data} />
          </>
        ))}
    </Card>
  );
}

function PeriodPicker({
  value,
  onChange,
}: {
  value: DashboardPeriod;
  onChange: (period: DashboardPeriod) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('dashboard.period.label')}
      className="flex rounded-control border border-silver-lining p-0.5"
    >
      {DashboardPeriodSchema.options.map((option) => (
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
          {t(`dashboard.period.${option}`)}
        </button>
      ))}
    </div>
  );
}

/** The two headline numbers of the period, each with what it is made of. */
function ResponseMetrics({ summary }: { summary: DashboardSummary }) {
  const { t, i18n } = useTranslation();
  const percent = new Intl.NumberFormat(i18n.language, { style: 'percent' });
  const days = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const { responseRate, medianDaysToFirstResponse: median } = summary;

  return (
    <dl className="grid grid-cols-2 gap-4">
      <Stat
        label={t('dashboard.responseRate')}
        value={responseRate === null ? '—' : percent.format(responseRate)}
        detail={
          summary.sent === 0
            ? t('dashboard.noneSent')
            : t('dashboard.respondedOfSent', { responded: summary.responded, sent: summary.sent })
        }
      />
      <Stat
        label={t('dashboard.firstResponse')}
        value={
          median === null ? '—' : t('dashboard.days', { count: median, value: days.format(median) })
        }
        detail={t('dashboard.firstResponseDetail')}
      />
    </dl>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-control bg-cloud-canvas px-4 py-3">
      <dt className="text-sm text-steel-text">{label}</dt>
      <dd className="text-page-title text-indigo-navy tabular-nums">{value}</dd>
      <dd className="text-xs text-steel-text">{detail}</dd>
    </div>
  );
}

/** Every application by its current state, as a bar per state (one hue: it only shows how many). */
function StatusCounts({ summary }: { summary: DashboardSummary }) {
  const { t } = useTranslation();
  const max = Math.max(...Object.values(summary.byStatus), 1);
  const statuses: ApplicationStatus[] = ApplicationStatusSchema.options;

  return (
    <section aria-labelledby="dashboard-by-status" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="dashboard-by-status" className="text-sm font-medium text-slate-ink">
          {t('dashboard.byStatus', { count: summary.total })}
        </h3>
        <Link
          to="/applications"
          className="text-sm font-medium text-slate-ink underline decoration-silver-lining underline-offset-2 hover:text-indigo-navy hover:decoration-indigo-navy"
        >
          {t('dashboard.seeAll')}
        </Link>
      </div>
      <ul className="flex flex-col gap-2">
        {statuses.map((status) => {
          const count = summary.byStatus[status];
          return (
            <li key={status} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-3 text-sm">
              <span className={count === 0 ? 'text-steel-text' : 'text-slate-ink'}>
                {t(`applications.statuses.${status}`)}
              </span>
              <span aria-hidden="true" className="h-2 rounded-full bg-cloud-canvas">
                {count > 0 && (
                  <span
                    className="block h-2 rounded-full bg-indigo-navy"
                    style={{ width: `${(count / max) * 100}%` }}
                  />
                )}
              </span>
              <span
                className={cn(
                  'text-right tabular-nums',
                  count === 0 ? 'text-steel-text' : 'text-slate-ink',
                )}
              >
                {count}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
