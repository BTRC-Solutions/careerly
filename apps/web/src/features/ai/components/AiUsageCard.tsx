import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Card } from '../../../shared/ui/Card';
import { useAiUsage } from '../api/useAiStatus';
import { currentMonth, formatCount, formatUsd } from '../lib/format';

/** This month's AI usage in Settings, with a link to the detail (RF-CONF-06). */
export function AiUsageCard() {
  const { t, i18n } = useTranslation();
  const usage = useAiUsage(currentMonth());
  const locale = i18n.language;

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-section-title text-indigo-navy">{t('ai.usage.cardTitle')}</h2>
          <p className="mt-1 text-sm text-steel-text">{t('ai.usage.cardDescription')}</p>
        </div>
        <Link
          to="/settings/ai-usage"
          className="shrink-0 text-sm font-medium text-indigo-navy underline-offset-4 hover:underline"
        >
          {t('ai.usage.seeDetail')}
        </Link>
      </div>
      {usage.data && (
        <dl className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <Stat label={t('ai.usage.cost')}>{formatUsd(usage.data.totals.costUsd, locale)}</Stat>
          <Stat label={t('ai.usage.calls')}>{formatCount(usage.data.totals.calls, locale)}</Stat>
          <Stat label={t('ai.usage.tokens')}>
            {formatCount(usage.data.totals.inputTokens + usage.data.totals.outputTokens, locale)}
          </Stat>
        </dl>
      )}
    </Card>
  );
}

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-steel-text">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-indigo-navy">{children}</dd>
    </div>
  );
}
