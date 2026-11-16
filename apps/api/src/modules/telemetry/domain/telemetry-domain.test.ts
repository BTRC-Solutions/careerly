import { describe, expect, it } from 'vitest';
import {
  answerConsent,
  consentStatus,
  enabledMetrics,
  type MetricCatalog,
  newMetrics,
  NO_PREFERENCES,
  toggleMetrics,
  withInstallId,
} from './telemetry-consent.js';
import { addDays, buildReport, TelemetryReportInvalidError } from './telemetry-report.js';

const V1: MetricCatalog = {
  activeUsage: 1,
  applications: 1,
  sources: 1,
  positionCategories: 1,
  positionTitles: 1,
  funnel: 1,
  workModeAndCountry: 1,
  features: 1,
};
/** A later release that adds a metric (simulated by moving `features` to version 2). */
const V2: MetricCatalog = { ...V1, features: 2 };
const V1_ONLY: MetricCatalog = { ...V1, features: 99 };

describe('telemetry consent (RF-TEL-01, RF-TEL-04, RN-19)', () => {
  it('starts pending, with every metric new and no id', () => {
    expect(consentStatus(NO_PREFERENCES)).toBe('PENDING');
    expect(newMetrics(NO_PREFERENCES, V1)).toHaveLength(8);
    expect(withInstallId(NO_PREFERENCES, () => 'id')).toEqual(NO_PREFERENCES);
  });

  it('"Rechazar todo" disables everything and never creates an id', () => {
    const prefs = withInstallId(answerConsent(NO_PREFERENCES, 'REJECT', {}, V1), () => 'id');
    expect(consentStatus(prefs)).toBe('REJECTED');
    expect(enabledMetrics(prefs)).toEqual([]);
    expect(prefs.installId).toBeNull();
    expect(newMetrics(prefs, V1)).toEqual([]);
  });

  it('"Aceptar" enables the checked metrics and creates the id', () => {
    const prefs = withInstallId(
      answerConsent(NO_PREFERENCES, 'ACCEPT', { positionTitles: false }, V1),
      () => 'id',
    );
    expect(consentStatus(prefs)).toBe('ACCEPTED');
    expect(enabledMetrics(prefs)).not.toContain('positionTitles');
    expect(enabledMetrics(prefs)).toHaveLength(7);
    expect(prefs.installId).toBe('id');
  });

  it('a new metric only asks about that metric; earlier answers do not change', () => {
    const answered = answerConsent(NO_PREFERENCES, 'ACCEPT', { funnel: false }, V1_ONLY);
    expect(answered.consentVersion).toBe(99);

    const v1Answer = answerConsent(NO_PREFERENCES, 'ACCEPT', { funnel: false }, V1);
    expect(newMetrics(v1Answer, V2)).toEqual(['features']);

    const rejectedNew = answerConsent(v1Answer, 'REJECT', {}, V2);
    expect(rejectedNew.metrics.features).toBe(false);
    expect(rejectedNew.metrics.funnel).toBe(false);
    expect(rejectedNew.metrics.activeUsage).toBe(true);
    expect(newMetrics(rejectedNew, V2)).toEqual([]);
  });

  it('turning every metric off means rejected; the id is kept for regeneration', () => {
    const accepted = withInstallId(answerConsent(NO_PREFERENCES, 'ACCEPT', {}, V1), () => 'id');
    const allOff = toggleMetrics(
      accepted,
      Object.fromEntries(Object.keys(V1).map((id) => [id, false])),
    );
    expect(consentStatus(allOff)).toBe('REJECTED');
    expect(allOff.installId).toBe('id');
  });
});

describe('buildReport (RN-18)', () => {
  const base = {
    installId: '9f1c2e4a-2b3c-4d5e-8f90-123456789abc',
    day: '2026-11-15',
    appVersion: '0.1.0',
  };

  it('builds a valid report', () => {
    expect(buildReport({ ...base, metrics: { activeUsage: { active: true } } })).toEqual({
      schemaVersion: 1,
      ...base,
      metrics: { activeUsage: { active: true } },
    });
  });

  it('fails instead of trimming a field outside the schema, without echoing values', () => {
    const metrics = { activeUsage: { active: true }, resume: 'Ada Lovelace, Senior Engineer' };
    expect(() => buildReport({ ...base, metrics: metrics as never })).toThrow(
      TelemetryReportInvalidError,
    );
    try {
      buildReport({ ...base, metrics: metrics as never });
    } catch (error) {
      expect((error as Error).message).not.toContain('Lovelace');
    }
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-11-16', -30)).toBe('2026-10-17');
  });
});
