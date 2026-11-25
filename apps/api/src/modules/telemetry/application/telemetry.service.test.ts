import type { TelemetryMetricId, TelemetryMetricsV1 } from '@careerly/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { NO_PREFERENCES, type TelemetryPreferences } from '../domain/telemetry-consent.js';
import {
  type StoredTelemetryReport,
  TelemetryActivityRepository,
  TelemetryCollector,
  TelemetryEnvironment,
  TelemetryPreferencesStore,
  TelemetryReportRepository,
} from './telemetry.ports.js';
import { MAX_DAYS_BACK, TelemetryService } from './telemetry.service.js';

class MemoryPreferences extends TelemetryPreferencesStore {
  prefs: TelemetryPreferences = NO_PREFERENCES;
  async load() {
    return this.prefs;
  }
  async save(prefs: TelemetryPreferences) {
    this.prefs = prefs;
  }
}

class MemoryReports extends TelemetryReportRepository {
  rows: StoredTelemetryReport[] = [];
  async existingDays(days: string[]) {
    return new Set(this.rows.map((row) => row.day).filter((day) => days.includes(day)));
  }
  async insert(report: StoredTelemetryReport) {
    this.rows.push(report);
  }
  async list() {
    return [...this.rows].sort((a, b) => b.day.localeCompare(a.day));
  }
  async deleteUnsent() {
    this.rows = this.rows.filter((row) => row.status === 'SENT');
  }
  async pending() {
    return this.rows.filter((row) => row.status === 'PENDING');
  }
  async countAttempt() {}
  async markSent() {}
  async markFailed() {}
}

class MemoryActivity extends TelemetryActivityRepository {
  days = new Set<string>();
  async record(day: string) {
    this.days.add(day);
  }
  async daysBetween(from: string, to: string) {
    return [...this.days].filter((day) => day >= from && day <= to).sort();
  }
  async has(day: string) {
    return this.days.has(day);
  }
}

class FakeEnvironment extends TelemetryEnvironment {
  readonly appVersion = '0.1.0';
  readonly receiverUrl = null;
  current = new Date(2026, 10, 16, 10, 0);
  private ids = 0;
  now() {
    return this.current;
  }
  newInstallId() {
    this.ids++;
    return `00000000-0000-4000-8000-${String(this.ids).padStart(12, '0')}`;
  }
}

class FakeCollector extends TelemetryCollector {
  constructor(
    readonly metric: TelemetryMetricId,
    private readonly produce: (day: string) => TelemetryMetricsV1,
  ) {
    super();
  }
  async collect(day: string) {
    return this.produce(day);
  }
}

describe('TelemetryService', () => {
  let preferences: MemoryPreferences;
  let reports: MemoryReports;
  let activity: MemoryActivity;
  let environment: FakeEnvironment;
  let collectors: TelemetryCollector[];
  let service: TelemetryService;

  const activeUsage = () =>
    new FakeCollector('activeUsage', (day) =>
      activity.days.has(day) ? { activeUsage: { active: true } } : {},
    );

  beforeEach(() => {
    preferences = new MemoryPreferences();
    reports = new MemoryReports();
    activity = new MemoryActivity();
    environment = new FakeEnvironment();
    collectors = [activeUsage()];
    service = new TelemetryService(preferences, reports, activity, environment, collectors);
  });

  async function useOn(day: Date) {
    environment.current = day;
    await service.recordActivity();
  }

  it('without a choice, nothing is recorded, built or identified (RN-19)', async () => {
    await useOn(new Date(2026, 10, 15, 9));
    environment.current = new Date(2026, 10, 16, 9);
    expect(await service.buildPendingReports()).toBe(0);
    expect(activity.days.size).toBe(0);
    expect((await service.getSettings()).installId).toBeNull();
    expect((await service.preview()).report).toBeNull();
  });

  it('after "Rechazar todo", nothing is recorded, built or identified (RN-19)', async () => {
    await service.updateSettings({ decision: 'REJECT' });
    await useOn(new Date(2026, 10, 15, 9));
    environment.current = new Date(2026, 10, 16, 9);
    expect(await service.buildPendingReports()).toBe(0);
    expect(activity.days.size).toBe(0);
    expect(preferences.prefs.installId).toBeNull();
  });

  it('the preview of a day is exactly the report stored once the day closes', async () => {
    await service.updateSettings({ decision: 'ACCEPT' });
    await useOn(new Date(2026, 10, 16, 11));
    const preview = (await service.preview()).report;
    expect(preview).toEqual({
      schemaVersion: 1,
      installId: preferences.prefs.installId,
      day: '2026-11-16',
      appVersion: '0.1.0',
      metrics: { activeUsage: { active: true } },
    });

    // Same day: not built yet (the day is not closed).
    expect(await service.buildPendingReports()).toBe(0);

    environment.current = new Date(2026, 10, 17, 0, 30);
    expect(await service.buildPendingReports()).toBe(1);
    expect(reports.rows).toEqual([
      expect.objectContaining({ day: '2026-11-16', status: 'PENDING', payload: preview }),
    ]);
    // Idempotent.
    expect(await service.buildPendingReports()).toBe(0);
  });

  it('builds only days with use, at most 30 days back', async () => {
    await service.updateSettings({ decision: 'ACCEPT' });
    activity.days = new Set(['2026-09-01', '2026-10-17', '2026-11-10', '2026-11-16']);
    environment.current = new Date(2026, 10, 16, 12);
    expect(await service.buildPendingReports()).toBe(2);
    expect(reports.rows.map((row) => row.day).sort()).toEqual(['2026-10-17', '2026-11-10']);
    expect(MAX_DAYS_BACK).toBe(30);
  });

  it('a field outside the schema makes the build fail and nothing is stored (RN-18)', async () => {
    collectors.push(
      new FakeCollector('applications', () => ({
        applications: { created: 1, companyName: 'Acme' } as never,
      })),
    );
    await service.updateSettings({ decision: 'ACCEPT' });
    await useOn(new Date(2026, 10, 15, 9));
    environment.current = new Date(2026, 10, 16, 9);

    expect(await service.buildPendingReports()).toBe(0);
    expect(reports.rows).toEqual([]);
    await expect(service.preview()).rejects.toThrow(/applications/);
  });

  it('only enabled metrics are collected, and toggling rebuilds unsent reports (RF-TEL-05)', async () => {
    collectors.push(new FakeCollector('applications', () => ({ applications: { created: 2 } })));
    await service.updateSettings({ decision: 'ACCEPT', metrics: { applications: false } });
    await useOn(new Date(2026, 10, 15, 9));
    environment.current = new Date(2026, 10, 16, 9);
    await service.buildPendingReports();
    expect(reports.rows[0]!.payload.metrics).toEqual({ activeUsage: { active: true } });

    await service.updateSettings({ metrics: { applications: true } });
    expect(reports.rows).toHaveLength(1);
    expect(reports.rows[0]!.payload.metrics).toEqual({
      activeUsage: { active: true },
      applications: { created: 2 },
    });
  });

  it('regenerating the id applies to the next reports only (RF-TEL-07)', async () => {
    await expect(service.regenerateInstallId()).rejects.toThrow(/no anonymous id/);
    await service.updateSettings({ decision: 'ACCEPT' });
    const first = preferences.prefs.installId;
    const second = await service.regenerateInstallId();
    expect(second).not.toBe(first);
    expect((await service.preview()).report?.installId).toBe(second);
  });
});
