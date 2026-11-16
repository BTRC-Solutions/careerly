import type {
  TelemetryMetricId,
  TelemetrySettingsResponse,
  UpdateTelemetrySettingsRequest,
} from '@careerly/contracts';

type Choices = Partial<Record<TelemetryMetricId, boolean>>;

/** Metrics the consent window asks about: never answered, or added in a newer version (RF-TEL-04). */
export function metricsToAsk(settings: TelemetrySettingsResponse): TelemetryMetricId[] {
  return settings.metrics.filter((metric) => metric.isNew).map((metric) => metric.id);
}

/** The window starts with every box checked; nothing is sent until "Aceptar" (RF-TEL-01). */
export function initialChoices(metrics: TelemetryMetricId[]): Choices {
  return Object.fromEntries(metrics.map((id) => [id, true]));
}

/**
 * "Aceptar" with the boxes as left by the user. With every box unchecked it is the same as
 * "Rechazar todo", so no anonymous id is created (RN-19).
 */
export function acceptRequest(choices: Choices): UpdateTelemetrySettingsRequest {
  const anyChecked = Object.values(choices).some(Boolean);
  return anyChecked ? { decision: 'ACCEPT', metrics: choices } : { decision: 'REJECT' };
}
