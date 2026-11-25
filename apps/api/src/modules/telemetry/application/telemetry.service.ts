import {
  TELEMETRY_METRIC_SINCE,
  type TelemetryMetricsV1,
  TelemetryMetricIdSchema,
  type TelemetryPreviewResponse,
  type TelemetryReportsResponse,
  type TelemetryReportV1,
  type TelemetrySettingsResponse,
  type UpdateTelemetrySettingsRequest,
} from '@careerly/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  answerConsent,
  consentStatus,
  isCollecting,
  type MetricCatalog,
  newMetrics,
  toggleMetrics,
  type TelemetryPreferences,
  withInstallId,
} from '../domain/telemetry-consent.js';
import { addDays, buildReport, localDay } from '../domain/telemetry-report.js';
import { utcDay } from '../domain/telemetry-sending.js';
import {
  TELEMETRY_COLLECTORS,
  TelemetryActivityRepository,
  TelemetryCollector,
  TelemetryEnvironment,
  TelemetryPreferencesStore,
  TelemetryReportRepository,
} from './telemetry.ports.js';

/** Reports are built for closed days up to this many days back (RF-TEL-08). */
export const MAX_DAYS_BACK = 30;

export class NoInstallIdError extends Error {
  constructor() {
    super('Telemetry is not enabled, so there is no anonymous id to regenerate.');
    this.name = 'NoInstallIdError';
  }
}

/**
 * Consent, anonymous id, daily reports and local history (RF-TEL-01 to RF-TEL-07). Built reports stay
 * `PENDING` until `TelemetrySender` sends them (step 8.9).
 */
@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);
  private readonly catalog: MetricCatalog = TELEMETRY_METRIC_SINCE;
  /** Last day recorded as active, to avoid a write on every request. */
  private lastRecordedDay: string | null = null;

  constructor(
    private readonly preferences: TelemetryPreferencesStore,
    private readonly reports: TelemetryReportRepository,
    private readonly activity: TelemetryActivityRepository,
    private readonly environment: TelemetryEnvironment,
    @Inject(TELEMETRY_COLLECTORS) private readonly collectors: TelemetryCollector[],
  ) {}

  async getSettings(): Promise<TelemetrySettingsResponse> {
    return this.toSettings(await this.preferences.load());
  }

  async updateSettings(
    request: UpdateTelemetrySettingsRequest,
  ): Promise<TelemetrySettingsResponse> {
    let prefs = await this.preferences.load();
    prefs = request.decision
      ? answerConsent(prefs, request.decision, request.metrics ?? {}, this.catalog)
      : toggleMetrics(prefs, request.metrics ?? {});
    prefs = withInstallId(prefs, () => this.environment.newInstallId());
    await this.preferences.save(prefs);

    // Unsent reports are rebuilt with the new choices: the change applies from the next send.
    await this.reports.deleteUnsent();
    this.lastRecordedDay = null;
    if (isCollecting(prefs)) {
      await this.recordActivity();
      await this.buildPendingReports();
    }
    return this.toSettings(prefs);
  }

  /** New anonymous id: later reports cannot be linked to earlier ones (RF-TEL-07). */
  async regenerateInstallId(): Promise<string> {
    const prefs = await this.preferences.load();
    if (prefs.installId === null) throw new NoInstallIdError();
    return this.startNewInstallation();
  }

  /**
   * A new id, and with it a new signing key (derived from the id, ADR-26). Unsent reports are rebuilt with the
   * new id, which the receiver gets to know in its first request. `waitUntilTomorrow` skips today's send, for
   * when the receiver turned the old key down (§19.2).
   */
  async startNewInstallation({ waitUntilTomorrow = false } = {}): Promise<string> {
    const prefs = await this.preferences.load();
    const installId = this.environment.newInstallId();
    await this.preferences.save({
      ...prefs,
      installId,
      registeredKey: null,
      lastSentDay: waitUntilTomorrow ? utcDay(this.environment.now()) : prefs.lastSentDay,
    });
    await this.reports.deleteUnsent();
    await this.buildPendingReports();
    return installId;
  }

  /** The exact report today's activity would produce so far, or `null` (RF-TEL-06). */
  async preview(): Promise<TelemetryPreviewResponse> {
    const prefs = await this.preferences.load();
    if (!isCollecting(prefs)) return { report: null };
    return { report: await this.assemble(prefs, localDay(this.environment.now())) };
  }

  async listReports(): Promise<TelemetryReportsResponse> {
    return { reports: await this.reports.list() };
  }

  /** Marks today as a day with use, only while telemetry is accepted (RN-19). */
  async recordActivity(): Promise<void> {
    const today = localDay(this.environment.now());
    if (this.lastRecordedDay === today) return;
    if (!isCollecting(await this.preferences.load())) return;
    await this.activity.record(today);
    this.lastRecordedDay = today;
  }

  /**
   * Builds the missing reports of closed days with use, up to {@link MAX_DAYS_BACK} days back.
   * A report that fails the schema is not stored and only logged (RN-18, RN-21).
   */
  async buildPendingReports(): Promise<number> {
    const prefs = await this.preferences.load();
    if (!isCollecting(prefs)) return 0;

    const today = localDay(this.environment.now());
    const days = await this.activity.daysBetween(
      addDays(today, -MAX_DAYS_BACK),
      addDays(today, -1),
    );
    const existing = await this.reports.existingDays(days);
    let built = 0;
    for (const day of days.filter((candidate) => !existing.has(candidate))) {
      try {
        const payload = await this.assemble(prefs, day);
        if (!payload) continue;
        await this.reports.insert({
          day,
          status: 'PENDING',
          attempts: 0,
          createdAt: this.environment.now().toISOString(),
          sentAt: null,
          payload,
        });
        built++;
      } catch (error) {
        this.logger.error(
          `Telemetry report for ${day} was not built: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
    return built;
  }

  /** Runs the collectors of the enabled metrics; `null` when there is nothing to report. */
  private async assemble(
    prefs: TelemetryPreferences,
    day: string,
  ): Promise<TelemetryReportV1 | null> {
    let metrics: TelemetryMetricsV1 = {};
    for (const collector of this.collectors) {
      if (prefs.metrics[collector.metric]) {
        metrics = { ...metrics, ...(await collector.collect(day)) };
      }
    }
    if (Object.keys(metrics).length === 0) return null;
    return buildReport({
      installId: prefs.installId!,
      day,
      appVersion: this.environment.appVersion,
      metrics,
    });
  }

  private toSettings(prefs: TelemetryPreferences): TelemetrySettingsResponse {
    const pending = new Set(newMetrics(prefs, this.catalog));
    return {
      status: consentStatus(prefs),
      consentVersion: prefs.consentVersion,
      promptRequired: pending.size > 0,
      metrics: TelemetryMetricIdSchema.options.map((id) => ({
        id,
        enabled: prefs.metrics[id] === true,
        isNew: pending.has(id),
      })),
      installId: prefs.installId,
    };
  }
}
