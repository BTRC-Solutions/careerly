import {
  type TelemetryMetricsV1,
  type TelemetryReportV1,
  TelemetryReportV1Schema,
} from '@careerly/contracts';

/**
 * The built report does not match the closed schema (RN-18). The message lists paths and rules only,
 * never values, so it is safe to log.
 */
export class TelemetryReportInvalidError extends Error {
  constructor(readonly issues: string[]) {
    super(`Telemetry report rejected by the schema: ${issues.join('; ')}`);
    this.name = 'TelemetryReportInvalidError';
  }
}

/**
 * Assembles and validates one day's report. Anything outside `TelemetryReportV1` makes it fail:
 * it is never trimmed silently (RN-18).
 */
export function buildReport(input: {
  installId: string;
  day: string;
  appVersion: string;
  metrics: TelemetryMetricsV1;
}): TelemetryReportV1 {
  const result = TelemetryReportV1Schema.safeParse({
    schemaVersion: 1,
    installId: input.installId,
    day: input.day,
    appVersion: input.appVersion,
    metrics: input.metrics,
  });
  if (!result.success) {
    throw new TelemetryReportInvalidError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.code}`),
    );
  }
  return result.data;
}

/** `YYYY-MM-DD` of `date` in the local time zone (the user's day). */
export function localDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The instants (ISO) where the local `day` starts and the next one starts: `[from, to)`. */
export function dayRange(day: string): { from: string; to: string } {
  const start = (value: string) => {
    const [year, month, date] = value.split('-').map(Number) as [number, number, number];
    return new Date(year, month - 1, date).toISOString();
  };
  return { from: start(day), to: start(addDays(day, 1)) };
}

/** `day` plus `delta` days (`YYYY-MM-DD` in, `YYYY-MM-DD` out). */
export function addDays(day: string, delta: number): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return localDay(new Date(year, month - 1, date + delta));
}
