import type { AiUsageTotals } from '@careerly/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { ChevronLeftIcon } from '../../../shared/ui/icons';
import { InlineError } from '../../../shared/ui/InlineError';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { useAiUsage } from '../api/useAiStatus';
import { Stat } from '../components/AiUsageCard';
import {
  currentMonth,
  formatCount,
  formatDay,
  formatMonth,
  formatUsd,
  shiftMonth,
} from '../lib/format';

/** AI usage per task, day and month (RF-CONF-06). Costs are estimates, for information only (D-02). */
export function AiUsagePage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const thisMonth = currentMonth();
  const [month, setMonth] = useState(thisMonth);
  const usage = useAiUsage(month);

  return (
    <div className="flex max-w-[45rem] flex-col gap-8">
      <Link
        to="/settings"
        className="inline-flex items-center gap-1 self-start text-sm text-steel-text hover:text-slate-ink"
      >
        <ChevronLeftIcon className="size-4" aria-hidden="true" />
        {t('ai.usage.back')}
      </Link>
      <PageHeader
        title={t('ai.usage.title')}
        description={t('ai.usage.description')}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              aria-label={t('ai.usage.previousMonth')}
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              ‹
            </Button>
            <span className="min-w-36 text-center text-sm font-medium capitalize text-slate-ink">
              {formatMonth(month, locale)}
            </span>
            <Button
              variant="secondary"
              size="sm"
              aria-label={t('ai.usage.nextMonth')}
              disabled={month >= thisMonth}
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              ›
            </Button>
          </>
        }
      />

      {usage.isError && (
        <Card>
          <InlineError>{t('ai.usage.loadError')}</InlineError>
        </Card>
      )}

      {usage.data && (
        <>
          <Card>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <Stat label={t('ai.usage.cost')}>{formatUsd(usage.data.totals.costUsd, locale)}</Stat>
              <Stat label={t('ai.usage.calls')}>
                {formatCount(usage.data.totals.calls, locale)}
              </Stat>
              <Stat label={t('ai.usage.inputTokens')}>
                {formatCount(usage.data.totals.inputTokens, locale)}
              </Stat>
              <Stat label={t('ai.usage.outputTokens')}>
                {formatCount(usage.data.totals.outputTokens, locale)}
              </Stat>
            </dl>
          </Card>

          <UsageTable
            title={t('ai.usage.byTask')}
            rows={usage.data.byTask.map((row) => ({
              ...row,
              key: row.task,
              label: t(`ai.tasks.${row.task}`),
            }))}
          />
          <UsageTable
            title={t('ai.usage.byDay')}
            rows={usage.data.byDay
              .filter((row) => row.calls > 0)
              .reverse()
              .map((row) => ({ ...row, key: row.day, label: formatDay(row.day, locale) }))}
          />
          <UsageTable
            title={t('ai.usage.byMonth')}
            rows={usage.data.byMonth
              .filter((row) => row.calls > 0)
              .reverse()
              .map((row) => ({ ...row, key: row.month, label: formatMonth(row.month, locale) }))}
          />
          <p className="text-xs text-steel-text">{t('ai.usage.estimateNote')}</p>
        </>
      )}
    </div>
  );
}

function UsageTable({
  title,
  rows,
}: {
  title: string;
  rows: (AiUsageTotals & { key: string; label: string })[];
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  return (
    <Card>
      <h2 className="text-section-title text-indigo-navy">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-steel-text">{t('ai.usage.empty')}</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-steel-text">
              <th scope="col" className="py-2 text-left font-medium">
                <span className="sr-only">{title}</span>
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {t('ai.usage.calls')}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {t('ai.usage.tokens')}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {t('ai.usage.cost')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-silver-lining">
                <th scope="row" className="py-2 text-left font-normal capitalize text-slate-ink">
                  {row.label}
                </th>
                <td className="py-2 text-right tabular-nums">{formatCount(row.calls, locale)}</td>
                <td className="py-2 text-right tabular-nums">
                  {formatCount(row.inputTokens + row.outputTokens, locale)}
                </td>
                <td className="py-2 text-right tabular-nums">{formatUsd(row.costUsd, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
