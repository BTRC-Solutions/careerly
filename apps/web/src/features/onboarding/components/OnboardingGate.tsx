import { Navigate } from 'react-router';
import { useSettings } from '../../settings/api/useSettings';
import { useTelemetrySettings } from '../../telemetry/api/useTelemetry';
import { onboardingSteps } from '../lib/steps';

/**
 * Sends the user to the first-run wizard when it is needed. Mounted in the app layout; renders nothing
 * otherwise. If the local API is down the app is not blocked: the home page shows the error.
 */
export function OnboardingGate() {
  const settings = useSettings();
  const telemetry = useTelemetrySettings();
  if (!settings.data || !telemetry.data) return null;

  const steps = onboardingSteps({
    onboardingCompleted: settings.data.preferences.onboardingCompletedAt !== null,
    telemetryPromptRequired: telemetry.data.promptRequired,
  });
  return steps.length > 0 ? <Navigate to="/welcome" replace /> : null;
}
