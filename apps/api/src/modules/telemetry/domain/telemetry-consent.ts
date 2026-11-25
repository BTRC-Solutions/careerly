import type { TelemetryConsentStatus, TelemetryMetricId } from '@careerly/contracts';

/**
 * What the user chose about telemetry (RF-TEL-01, RF-TEL-04, RF-TEL-05, RN-19).
 * `metrics` only holds answered metrics; a metric without an entry was never offered.
 */
export interface TelemetryPreferences {
  /** Consent version the user last answered; 0 = never answered. */
  consentVersion: number;
  metrics: Partial<Record<TelemetryMetricId, boolean>>;
  /** Anonymous installation id; only exists once a metric was accepted. */
  installId: string | null;
  /** Public key the receiver already has for `installId`; `null` until its first accepted request. */
  registeredKey: string | null;
  /** UTC day of the last request the receiver took (`2xx` or `409`): one per day (ARCHITECTURE §19.2). */
  lastSentDay: string | null;
}

/** The metric catalog: the consent version in which each metric was added. */
export type MetricCatalog = Record<TelemetryMetricId, number>;

export const NO_PREFERENCES: TelemetryPreferences = {
  consentVersion: 0,
  metrics: {},
  installId: null,
  registeredKey: null,
  lastSentDay: null,
};

export function enabledMetrics(prefs: TelemetryPreferences): TelemetryMetricId[] {
  return (Object.keys(prefs.metrics) as TelemetryMetricId[]).filter((id) => prefs.metrics[id]);
}

/** Metrics added after the user's last answer: the window asks only about these. */
export function newMetrics(
  prefs: TelemetryPreferences,
  catalog: MetricCatalog,
): TelemetryMetricId[] {
  return (Object.keys(catalog) as TelemetryMetricId[]).filter(
    (id) => catalog[id] > prefs.consentVersion,
  );
}

export function consentStatus(prefs: TelemetryPreferences): TelemetryConsentStatus {
  if (prefs.consentVersion === 0) return 'PENDING';
  return enabledMetrics(prefs).length > 0 ? 'ACCEPTED' : 'REJECTED';
}

/** Whether anything may be recorded or reported (RN-19). */
export function isCollecting(prefs: TelemetryPreferences): boolean {
  return consentStatus(prefs) === 'ACCEPTED' && prefs.installId !== null;
}

/**
 * Answers the consent window. Only the new metrics change: `ACCEPT` enables them (except the ones
 * unchecked in `choices`), `REJECT` disables them. Earlier answers stay as they were (RF-TEL-04).
 */
export function answerConsent(
  prefs: TelemetryPreferences,
  decision: 'ACCEPT' | 'REJECT',
  choices: Partial<Record<TelemetryMetricId, boolean>>,
  catalog: MetricCatalog,
): TelemetryPreferences {
  const metrics = { ...prefs.metrics };
  for (const id of newMetrics(prefs, catalog)) {
    metrics[id] = decision === 'ACCEPT' ? (choices[id] ?? true) : false;
  }
  if (decision === 'ACCEPT') {
    // Choices about already-answered metrics in the same request are applied too.
    Object.assign(metrics, choices);
  }
  return { ...prefs, metrics, consentVersion: Math.max(...Object.values(catalog), 0) };
}

/** Turns metrics on or off from Settings → Privacy (RF-TEL-05). */
export function toggleMetrics(
  prefs: TelemetryPreferences,
  changes: Partial<Record<TelemetryMetricId, boolean>>,
): TelemetryPreferences {
  return { ...prefs, metrics: { ...prefs.metrics, ...changes } };
}

/** The anonymous id is created only when at least one metric is enabled (RN-19). */
export function withInstallId(
  prefs: TelemetryPreferences,
  newId: () => string,
): TelemetryPreferences {
  if (prefs.installId !== null || enabledMetrics(prefs).length === 0) return prefs;
  return { ...prefs, installId: newId() };
}
