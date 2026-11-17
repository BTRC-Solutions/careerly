import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Card } from '../../../shared/ui/Card';
import { InlineError } from '../../../shared/ui/InlineError';
import type { AiUnavailableReason } from '../useAiAvailability';

/** Why an AI action is disabled, with the way out when there is one (Settings). */
export function AiUnavailableNotice({ reason }: { reason: AiUnavailableReason }) {
  const { t } = useTranslation();
  return (
    <Card className="flex flex-col items-start gap-4">
      <InlineError>{t(`ai.unavailable.${reason}`)}</InlineError>
      {reason !== 'OFFLINE' && (
        <Link
          to="/settings"
          className="inline-flex h-9 items-center rounded-control bg-indigo-navy px-4 text-sm font-medium text-pure-white shadow-button hover:bg-midnight-ink"
        >
          {t('ai.unavailable.goToSettings')}
        </Link>
      )}
    </Card>
  );
}
