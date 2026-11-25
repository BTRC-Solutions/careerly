import {
  TELEMETRY_MAX_DAYS_BACK,
  TELEMETRY_POW_HEADER,
  TELEMETRY_SIGNATURE_HEADER,
  TelemetryBatchV1Schema,
  telemetryPowChallenge,
} from '@careerly/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { isCollecting } from '../domain/telemetry-consent.js';
import { addUtcDays, utcDay } from '../domain/telemetry-sending.js';
import {
  ProofOfWork,
  type ReceiverAnswer,
  TelemetryEnvironment,
  TelemetryKeys,
  TelemetryPreferencesStore,
  TelemetryReportRepository,
  TelemetryTransport,
} from './telemetry.ports.js';
import { TelemetryService } from './telemetry.service.js';

/** Difficulty used when a `428` does not say one; above the cap the proof is not attempted. */
const DEFAULT_POW_DIFFICULTY = 20;
const MAX_POW_DIFFICULTY = 26;

export type SendOutcome =
  /** Telemetry off, no receiver URL or no signing key: nothing is attempted. */
  | 'OFF'
  | 'NOTHING_TO_SEND'
  | 'SENT'
  /** The receiver already had a request of this installation today (`409`), or this app sent one. */
  | 'ALREADY_SENT_TODAY'
  /** The key does not match the one registered for the id: a new id and key take over (ADR-26). */
  | 'NEW_INSTALLATION'
  /** The receiver will never take these reports (`400`, `410`, `413`, `415`…): they are not sent again. */
  | 'REJECTED';

/** No answer, or one worth retrying (`429`, `5xx`): the job tries again later. */
export class TelemetrySendRetryableError extends Error {
  constructor(
    readonly code: string,
    readonly retryAfterSeconds: number | null,
  ) {
    super(`Telemetry reports were not sent: ${code}`);
    this.name = 'TelemetrySendRetryableError';
  }
}

/**
 * Sends the pending reports in one signed batch, at most one accepted request per UTC day (ARCHITECTURE §19.2,
 * ADR-26). What is signed is exactly what is stored and shown in Privacy. The log has codes and counts, never
 * the reports, the key or the id.
 */
@Injectable()
export class TelemetrySender {
  private readonly logger = new Logger(TelemetrySender.name);

  constructor(
    private readonly preferences: TelemetryPreferencesStore,
    private readonly reports: TelemetryReportRepository,
    private readonly keys: TelemetryKeys,
    private readonly transport: TelemetryTransport,
    private readonly proofOfWork: ProofOfWork,
    private readonly environment: TelemetryEnvironment,
    private readonly telemetry: TelemetryService,
  ) {}

  /** Whether a send can be attempted at all: telemetry accepted, a receiver and a key. */
  async canSend(): Promise<boolean> {
    const prefs = await this.preferences.load();
    return (
      this.environment.receiverUrl !== null &&
      isCollecting(prefs) &&
      this.keys.forInstallation(prefs.installId!) !== null
    );
  }

  async send(): Promise<SendOutcome> {
    const url = this.environment.receiverUrl;
    const prefs = await this.preferences.load();
    if (!url || !isCollecting(prefs)) return 'OFF';
    const installId = prefs.installId!;
    const key = this.keys.forInstallation(installId);
    if (!key) return 'OFF';

    const now = this.environment.now();
    const today = utcDay(now);
    if (prefs.lastSentDay === today) return 'ALREADY_SENT_TODAY';
    // Another computer, a restored backup or a lost secret: the id is never reused with another key.
    if (prefs.registeredKey !== null && prefs.registeredKey !== key.publicKey) {
      await this.telemetry.startNewInstallation();
      this.logger.log('Telemetry key changed: a new anonymous id takes over.');
      return 'NEW_INSTALLATION';
    }

    const pending = await this.reports.pending();
    const oldest = addUtcDays(today, -TELEMETRY_MAX_DAYS_BACK);
    const late = pending.filter((report) => report.day < oldest);
    if (late.length > 0) await this.reports.markFailed(late.map((report) => report.day));
    const reports = pending
      .filter((report) => report.day >= oldest && report.payload.installId === installId)
      .map((report) => report.payload);
    if (reports.length === 0) return 'NOTHING_TO_SEND';
    const days = reports.map((report) => report.day);

    const batch = TelemetryBatchV1Schema.safeParse({
      schemaVersion: 1,
      installId,
      sentAt: now.toISOString(),
      ...(prefs.registeredKey === null ? { publicKey: key.publicKey } : {}),
      reports,
    });
    if (!batch.success) {
      // Paths and rules only, never the values (RN-18).
      this.logger.error(
        `Telemetry batch rejected by the schema: ${batch.error.issues
          .slice(0, 5)
          .map((issue) => `${issue.path.join('.')}: ${issue.code}`)
          .join('; ')}`,
      );
      await this.reports.markFailed(days);
      return 'REJECTED';
    }

    const body = JSON.stringify(batch.data);
    const headers = {
      'Content-Type': 'application/json',
      [TELEMETRY_SIGNATURE_HEADER]: key.sign(body),
    };
    await this.reports.countAttempt(days);
    let answer = await this.post(`${url}/v1/reports`, body, headers);
    if (answer.status === 428) {
      const difficulty = answer.difficulty ?? DEFAULT_POW_DIFFICULTY;
      if (difficulty > MAX_POW_DIFFICULTY) {
        throw new TelemetrySendRetryableError('POW_TOO_HARD', null);
      }
      const nonce = await this.proofOfWork.solve(
        (candidate) => telemetryPowChallenge(installId, key.publicKey, today, candidate),
        difficulty,
      );
      answer = await this.post(`${url}/v1/reports`, body, {
        ...headers,
        [TELEMETRY_POW_HEADER]: nonce,
      });
    }

    const { status } = answer;
    if ((status >= 200 && status < 300) || status === 409) {
      await this.reports.markSent(days, now.toISOString());
      await this.preferences.save({
        ...(await this.preferences.load()),
        registeredKey: key.publicKey,
        lastSentDay: today,
      });
      this.logger.log(`Telemetry: ${days.length} report(s) sent (HTTP ${status}).`);
      return status === 409 ? 'ALREADY_SENT_TODAY' : 'SENT';
    }
    if (status === 429 || status >= 500) {
      throw new TelemetrySendRetryableError(`HTTP_${status}`, answer.retryAfterSeconds);
    }
    if (status === 401) {
      // The receiver knows this id with another key: a new id and key, from tomorrow on (§19.2).
      await this.telemetry.startNewInstallation({ waitUntilTomorrow: true });
      this.logger.warn(
        'Telemetry: the receiver did not accept the key (HTTP 401); a new id takes over.',
      );
      return 'NEW_INSTALLATION';
    }
    // 400, 410, 413, 415, 428 after the proof…: the same body would get the same answer.
    await this.reports.markFailed(days);
    this.logger.warn(`Telemetry: ${days.length} report(s) rejected (HTTP ${status}).`);
    return 'REJECTED';
  }

  private async post(
    url: string,
    body: string,
    headers: Record<string, string>,
  ): Promise<ReceiverAnswer> {
    try {
      return await this.transport.post(url, body, headers);
    } catch (error) {
      throw new TelemetrySendRetryableError(
        error instanceof Error && error.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK',
        null,
      );
    }
  }
}
