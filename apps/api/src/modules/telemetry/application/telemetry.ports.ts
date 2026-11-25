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
  /** Reports waiting to be sent, oldest first. */
  abstract pending(): Promise<StoredTelemetryReport[]>;
  /** One more attempt for each of these days. */
  abstract countAttempt(days: string[]): Promise<void>;
  abstract markSent(days: string[], sentAt: string): Promise<void>;
  /** The receiver will never take them: they are not sent again. */
  abstract markFailed(days: string[]): Promise<void>;
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

/** What the sender needs from the receiver's answer. */
export interface ReceiverAnswer {
  status: number;
  /** `Retry-After`, in seconds. */
  retryAfterSeconds: number | null;
  /** Leading zero bits the proof of work needs (`428`). */
  difficulty: number | null;
}

/** The request to the receiver. Throws only when there is no answer (no network, timeout). */
export abstract class TelemetryTransport {
  abstract post(
    url: string,
    body: string,
    headers: Record<string, string>,
  ): Promise<ReceiverAnswer>;
}

/** The signing key of one installation (ADR-26). */
export interface InstallationKey {
  /** The 32 raw bytes in base64url. */
  publicKey: string;
  /** Ed25519 signature of the exact body bytes, in base64. */
  sign(body: string): string;
}

/** Signing keys, derived from the secret Electron's main keeps; `null` while there is none (nothing is sent). */
export abstract class TelemetryKeys {
  abstract forInstallation(installId: string): InstallationKey | null;
}

/** Hashcash: a nonce whose challenge's SHA-256 starts with `difficulty` zero bits. */
export abstract class ProofOfWork {
  abstract solve(challenge: (nonce: string) => string, difficulty: number): Promise<string>;
}

/** Clock, app version, the receiver and id generation. */
export abstract class TelemetryEnvironment {
  abstract readonly appVersion: string;
  /** Where reports go; `null` = sending is off (development, tests). */
  abstract readonly receiverUrl: string | null;
  abstract now(): Date;
  abstract newInstallId(): string;
}
