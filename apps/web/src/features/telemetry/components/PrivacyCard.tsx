import type { TelemetryMetricId } from '@careerly/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { InlineError } from '../../../shared/ui/InlineError';
import {
  useRegenerateInstallId,
  useTelemetryPreview,
  useTelemetryReports,
  useTelemetrySettings,
  useUpdateTelemetrySettings,
} from '../api/useTelemetry';
import { NeverSentList } from './NeverSentList';
import { MetricCheckbox } from './TelemetryConsentForm';

/**
 * Settings → Privacy (RF-TEL-02, RF-TEL-05 to RF-TEL-07): what is never sent, each metric on or off,
 * the exact JSON of the next report, the local history and the anonymous id.
 */
export function PrivacyCard() {
  const { t } = useTranslation();
  const settings = useTelemetrySettings();

  return (
    <Card>
      <h2 className="text-section-title text-indigo-navy">{t('settings.privacy.title')}</h2>
      <p className="mt-1 text-sm text-steel-text">{t('settings.privacy.description')}</p>

      {settings.isPending && (
        <p role="status" className="mt-4 text-sm text-steel-text">
          {t('settings.loading')}
        </p>
      )}
      {settings.isError && (
        <InlineError className="mt-4">
          {t('settings.privacy.loadError', { message: settings.error.message })}
        </InlineError>
      )}

      {settings.data && (
        <div className="mt-4 flex flex-col gap-6">
          {settings.data.status === 'PENDING' ? (
            <p className="text-sm text-slate-ink">
              {t('settings.privacy.pending')}{' '}
              <Link to="/welcome" className="font-medium text-indigo-navy underline">
                {t('settings.privacy.choose')}
              </Link>
            </p>
          ) : (
            <MetricToggles
              enabled={Object.fromEntries(settings.data.metrics.map((m) => [m.id, m.enabled]))}
            />
          )}
          <NeverSentList />
          {settings.data.installId && <InstallId installId={settings.data.installId} />}
          {settings.data.status === 'ACCEPTED' && <NextReport />}
          <History hasConsent={settings.data.status !== 'PENDING'} />
        </div>
      )}
    </Card>
  );
}

function MetricToggles({ enabled }: { enabled: Partial<Record<TelemetryMetricId, boolean>> }) {
  const { t } = useTranslation();
  const update = useUpdateTelemetrySettings();
  const ids = Object.keys(enabled) as TelemetryMetricId[];

  return (
    <fieldset aria-busy={update.isPending}>
      <legend className="text-sm font-medium text-indigo-navy">
        {t('settings.privacy.metricsTitle')}
      </legend>
      <p className="mt-1 text-sm text-steel-text">{t('settings.privacy.metricsHint')}</p>
      <div className="mt-3 flex flex-col gap-2">
        {ids.map((id) => (
          <MetricCheckbox
            key={id}
            id={id}
            checked={enabled[id] ?? false}
            onChange={(checked) => update.mutate({ metrics: { [id]: checked } })}
          />
        ))}
      </div>
      {update.isError && (
        <InlineError className="mt-3">
          {t('settings.privacy.saveError', { message: update.error.message })}
        </InlineError>
      )}
    </fieldset>
  );
}

function InstallId({ installId }: { installId: string }) {
  const { t } = useTranslation();
  const regenerate = useRegenerateInstallId();
  const [confirming, setConfirming] = useState(false);

  return (
    <div>
      <p className="text-sm font-medium text-indigo-navy">{t('settings.privacy.installId')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <code className="rounded-control border border-silver-lining bg-cloud-canvas px-3 py-1.5 font-mono text-[13px] text-charcoal">
          {installId}
        </code>
        <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
          {t('settings.privacy.regenerate')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('settings.privacy.regenerateTitle')}
        description={t('settings.privacy.regenerateDescription')}
        confirmLabel={t('settings.privacy.regenerate')}
        onConfirm={() => regenerate.mutateAsync()}
      />
    </div>
  );
}

function NextReport() {
  const { t } = useTranslation();
  const preview = useTelemetryPreview(true);

  return (
    <details className="group">
      <summary className="cursor-pointer text-sm font-medium text-indigo-navy">
        {t('settings.privacy.previewTitle')}
      </summary>
      <div className="mt-2">
        {preview.isError && <InlineError>{preview.error.message}</InlineError>}
        {preview.data &&
          (preview.data.report ? (
            <JsonBlock value={preview.data.report} />
          ) : (
            <p className="text-sm text-steel-text">{t('settings.privacy.previewEmpty')}</p>
          ))}
      </div>
    </details>
  );
}

function History({ hasConsent }: { hasConsent: boolean }) {
  const { t, i18n } = useTranslation();
  const reports = useTelemetryReports(hasConsent);
  if (!hasConsent) return null;

  return (
    <div>
      <p className="text-sm font-medium text-indigo-navy">{t('settings.privacy.historyTitle')}</p>
      {reports.isError && <InlineError className="mt-2">{reports.error.message}</InlineError>}
      {reports.data?.reports.length === 0 && (
        <p className="mt-1 text-sm text-steel-text">{t('settings.privacy.historyEmpty')}</p>
      )}
      {reports.data && reports.data.reports.length > 0 && (
        <ul className="mt-2 flex flex-col divide-y divide-silver-lining rounded-control border border-silver-lining">
          {reports.data.reports.map((report) => (
            <li key={report.day} className="px-4 py-2">
              <details>
                <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm text-slate-ink">
                  <span>
                    {new Date(`${report.day}T12:00:00`).toLocaleDateString(i18n.language, {
                      dateStyle: 'medium',
                    })}
                  </span>
                  <span className="text-steel-text">
                    {t(`settings.privacy.reportStatus.${report.status}`)}
                  </span>
                </summary>
                <div className="mt-2">
                  <JsonBlock value={report.payload} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-control border border-silver-lining bg-cloud-canvas p-3 font-mono text-[12px] text-charcoal">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
