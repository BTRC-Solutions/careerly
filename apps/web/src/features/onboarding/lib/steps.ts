export type OnboardingStep = 'language' | 'ai' | 'telemetry';

/**
 * Which steps the first-run wizard shows (RF-CONF-01, RF-TEL-01, RF-TEL-04):
 * - the first time: language, AI key and telemetry consent;
 * - later, only when a new version adds telemetry metrics: the consent step, about those metrics.
 * An empty list means the wizard is not needed.
 */
export function onboardingSteps(state: {
  onboardingCompleted: boolean;
  telemetryPromptRequired: boolean;
}): OnboardingStep[] {
  if (!state.onboardingCompleted) {
    return state.telemetryPromptRequired ? ['language', 'ai', 'telemetry'] : ['language', 'ai'];
  }
  return state.telemetryPromptRequired ? ['telemetry'] : [];
}
