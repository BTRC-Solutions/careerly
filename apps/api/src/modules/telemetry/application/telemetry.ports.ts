import type { TelemetryMetricId, TelemetryMetricsV1, TelemetryReportV1 } from '@careerly/contracts';
import type { TelemetryPreferences } from '../domain/telemetry-consent.js';

// Ports of the telemetry module, declared as abstract classes so they can be Nest DI tokens.

/** Where the user's choices live (`settings`, namespace `telemetry`). */
export abstract class TelemetryPreferencesStore {
  abstract load(): Promise<TelemetryPreferences>;
  abstract save(prefs: TelemetryPreferences): Promise<void>;
}

export interface StoredTelemetryReport {
  day: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  attempts: number;
  createdAt: string;
  sentAt: string | null;
  payload: TelemetryReportV1;
}

export abstract class TelemetryReportRepository {
  /** Days (among `days`) that already have a report. */
  abstract existingDays(days: string[]): Promise<Set<string>>;
  abstract insert(report: StoredTelemetryReport): Promise<void>;
  /** Newest first. */
  abstract list(): Promise<StoredTelemetryReport[]>;
  /** Drops reports not sent yet, so they are rebuilt with the current choices (RF-TEL-05). */
  abstract deleteUnsent(): Promise<void>;
}

/** Local days in which the app was used. */
export abstract class TelemetryActivityRepository {
  abstract record(day: string): Promise<void>;
  /** Recorded days in `[from, to]`, ascending. */
  abstract daysBetween(from: string, to: string): Promise<string[]>;
  abstract has(day: string): Promise<boolean>;
}

/**
 * Produces one metric for a day, reading other modules only through their public services.
 * Returns only numbers, enums or the trimmed title; the schema check catches anything else (RN-18).
 */
export abstract class TelemetryCollector {
  abstract readonly metric: TelemetryMetricId;
  abstract collect(day: string): Promise<TelemetryMetricsV1>;
}

/** DI token for the list of collectors. */
export const TELEMETRY_COLLECTORS = Symbol('TELEMETRY_COLLECTORS');

/** Clock, app version and id generation. */
export abstract class TelemetryEnvironment {
  abstract readonly appVersion: string;
  abstract now(): Date;
  abstract newInstallId(): string;
}
