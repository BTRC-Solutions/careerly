import { describe, expect, it } from 'vitest';
import { onboardingSteps } from './steps';

describe('onboardingSteps', () => {
  it('shows every step on the first run', () => {
    expect(onboardingSteps({ onboardingCompleted: false, telemetryPromptRequired: true })).toEqual([
      'language',
      'ai',
      'telemetry',
    ]);
  });

  it('only asks about new telemetry metrics after the first run', () => {
    expect(onboardingSteps({ onboardingCompleted: true, telemetryPromptRequired: true })).toEqual([
      'telemetry',
    ]);
  });

  it('is not needed once everything was answered', () => {
    expect(onboardingSteps({ onboardingCompleted: true, telemetryPromptRequired: false })).toEqual(
      [],
    );
  });

  it('skips the consent step if it was already answered', () => {
    expect(onboardingSteps({ onboardingCompleted: false, telemetryPromptRequired: false })).toEqual(
      ['language', 'ai'],
    );
  });
});
