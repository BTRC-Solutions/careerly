import type { TelemetryMetricId, TelemetrySettingsResponse } from '@careerly/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/Button';
import { InlineError } from '../../../shared/ui/InlineError';
import { useUpdateTelemetrySettings } from '../api/useTelemetry';
import { acceptRequest, initialChoices, metricsToAsk } from '../lib/consent';
import { NeverSentList } from './NeverSentList';

/**
 * Consent window (RF-TEL-01, RF-TEL-02, RF-TEL-04): one checkbox per metric, checked by default,
 * but nothing is sent until "Aceptar". "Rechazar todo" has the same visual weight. Leaving without
 * choosing keeps telemetry off.
 */
export function TelemetryConsentForm({
  settings,
  onAnswered,
}: {
  settings: TelemetrySettingsResponse;
  onAnswered: () => void;
}) {
  const { t } = useTranslation();
  const metrics = metricsToAsk(settings);
  const [choices, setChoices] = useState(() => initialChoices(metrics));
  const update = useUpdateTelemetrySettings();
  const onlyNew = settings.consentVersion > 0;

  async function answer(decision: 'ACCEPT' | 'REJECT') {
    try {
      await update.mutateAsync(decision === 'ACCEPT' ? acceptRequest(choices) : { decision });
      onAnswered();
    } catch {
      // Shown below through `update.error`.
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-slate-ink">
        {onlyNew ? t('telemetry.consent.newMetrics') : t('telemetry.consent.intro')}
      </p>

      <fieldset>
        <legend className="text-sm font-medium text-indigo-navy">
          {t('telemetry.consent.metricsTitle')}
        </legend>
        <div className="mt-2 flex flex-col gap-2">
          {metrics.map((id) => (
            <MetricCheckbox
              key={id}
              id={id}
              checked={choices[id] ?? false}
              onChange={(checked) => setChoices((current) => ({ ...current, [id]: checked }))}
            />
          ))}
        </div>
      </fieldset>

      <NeverSentList />

      {update.isError && (
        <InlineError>{t('telemetry.consent.error', { message: update.error.message })}</InlineError>
      )}

      {/* Same weight for both answers (RF-TEL-01): neither is the "default" primary action. */}
      <div className="flex justify-end gap-3">
        <Button
          variant="secondary"
          disabled={update.isPending}
          onClick={() => void answer('REJECT')}
        >
          {t('telemetry.consent.rejectAll')}
        </Button>
        <Button
          variant="secondary"
          disabled={update.isPending}
          onClick={() => void answer('ACCEPT')}
        >
          {t('telemetry.consent.accept')}
        </Button>
      </div>
    </div>
  );
}

export function MetricCheckbox({
  id,
  checked,
  onChange,
  disabled,
}: {
  id: TelemetryMetricId;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-control border border-silver-lining px-4 py-3 transition-colors hover:bg-cloud-canvas">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-indigo-navy"
      />
      <span className="flex flex-col">
        <span className="text-sm font-medium text-slate-ink">
          {t(`telemetry.metrics.${id}.name`)}
        </span>
        <span className="text-sm text-steel-text">{t(`telemetry.metrics.${id}.description`)}</span>
      </span>
    </label>
  );
}
