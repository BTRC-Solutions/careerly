import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { InlineError } from '../../../shared/ui/InlineError';
import { useSettings, useUpdateSettings } from '../../settings/api/useSettings';
import { AiKeyCard } from '../../settings/components/AiKeyCard';
import { LanguageSettingsCard } from '../../settings/components/LanguageSettingsCard';
import { UiLanguageSync } from '../../settings/components/UiLanguageSync';
import { useTelemetrySettings } from '../../telemetry/api/useTelemetry';
import { TelemetryConsentForm } from '../../telemetry/components/TelemetryConsentForm';
import { type OnboardingStep, onboardingSteps } from '../lib/steps';

/**
 * First-run wizard (RF-CONF-01, RF-CONF-08, RF-TEL-01): interface language, AI provider and key,
 * telemetry consent. Later starts only show it again when there are new telemetry metrics.
 */
export function WelcomePage() {
  const { t } = useTranslation();
  const settings = useSettings();
  const telemetry = useTelemetrySettings();

  if (settings.isError || telemetry.isError) {
    const error = settings.error ?? telemetry.error;
    return (
      <WelcomeFrame>
        <Card>
          <InlineError>{t('onboarding.loadError', { message: error?.message })}</InlineError>
        </Card>
      </WelcomeFrame>
    );
  }
  if (!settings.data || !telemetry.data) {
    return (
      <WelcomeFrame>
        <p role="status" className="text-sm text-steel-text">
          {t('settings.loading')}
        </p>
      </WelcomeFrame>
    );
  }

  return (
    <Wizard
      // Computed once: answering a step must not reshuffle the remaining ones.
      steps={onboardingSteps({
        onboardingCompleted: settings.data.preferences.onboardingCompletedAt !== null,
        telemetryPromptRequired: telemetry.data.promptRequired,
      })}
    />
  );
}

function Wizard({ steps: initialSteps }: { steps: OnboardingStep[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [steps] = useState(initialSteps);
  const [index, setIndex] = useState(0);
  const settings = useSettings();
  const telemetry = useTelemetrySettings();
  const updateSettings = useUpdateSettings();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the new step's title: screen readers announce it, and an extra Enter on the
  // "Next" button (which stays the same element) cannot skip a step.
  useEffect(() => {
    if (index > 0) headingRef.current?.focus();
  }, [index]);

  if (steps.length === 0) return <Navigate to="/" replace />;

  const step = steps[index]!;
  const isLast = index === steps.length - 1;

  async function next() {
    if (!isLast) {
      setIndex(index + 1);
      return;
    }
    if (settings.data?.preferences.onboardingCompletedAt === null) {
      try {
        await updateSettings.mutateAsync({ onboardingCompletedAt: new Date().toISOString() });
      } catch {
        return; // Shown below through `updateSettings.error`.
      }
    }
    void navigate('/', { replace: true });
  }

  return (
    <WelcomeFrame>
      <header>
        {steps.length > 1 && (
          <p className="text-sm text-steel-text">
            {t('onboarding.progress', { current: index + 1, total: steps.length })}
          </p>
        )}
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mt-1 text-2xl font-semibold tracking-tight text-indigo-navy focus:outline-none"
        >
          {t(`onboarding.steps.${step}.title`)}
        </h1>
        <p className="mt-1 text-sm text-steel-text">{t(`onboarding.steps.${step}.description`)}</p>
      </header>

      {step === 'language' && settings.data && (
        <LanguageSettingsCard value={settings.data.preferences.uiLanguage} />
      )}
      {step === 'ai' && settings.data && <AiKeyCard backendStatus={settings.data.aiKey} />}
      {step === 'telemetry' && telemetry.data && (
        <Card>
          {/* Answering is the way forward: there is no "Next" that skips the choice. */}
          <TelemetryConsentForm settings={telemetry.data} onAnswered={() => void next()} />
        </Card>
      )}

      {updateSettings.isError && (
        <InlineError>
          {t('onboarding.saveError', { message: updateSettings.error.message })}
        </InlineError>
      )}

      <div className="flex items-center justify-between gap-3">
        {index > 0 ? (
          <Button variant="ghost" onClick={() => setIndex(index - 1)}>
            {t('onboarding.back')}
          </Button>
        ) : (
          <span />
        )}
        {step !== 'telemetry' && (
          <div className="flex items-center gap-3">
            {step === 'ai' && (
              <p className="text-sm text-steel-text">{t('onboarding.steps.ai.later')}</p>
            )}
            <Button disabled={updateSettings.isPending} onClick={() => void next()}>
              {isLast ? t('onboarding.finish') : t('onboarding.next')}
            </Button>
          </div>
        )}
      </div>
    </WelcomeFrame>
  );
}

function WelcomeFrame({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="h-full overflow-y-auto bg-cloud-canvas">
      <UiLanguageSync />
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
        <p className="text-xl font-semibold tracking-tight text-indigo-navy">
          {t('onboarding.brand')}
        </p>
        {children}
      </main>
    </div>
  );
}
