import { TelemetryReportV1Schema } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { asc, between, desc, eq, inArray, ne } from 'drizzle-orm';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { telemetryActivityDays, telemetryReports } from '../../../platform/database/schema.js';
import {
  type StoredTelemetryReport,
  TelemetryActivityRepository,
  TelemetryReportRepository,
} from '../application/telemetry.ports.js';

@Injectable()
export class DrizzleTelemetryReportRepository extends TelemetryReportRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async existingDays(days: string[]): Promise<Set<string>> {
    if (days.length === 0) return new Set();
    const rows = await this.database.db
      .select({ day: telemetryReports.day })
      .from(telemetryReports)
      .where(inArray(telemetryReports.day, days));
    return new Set(rows.map((row) => row.day));
  }

  async insert(report: StoredTelemetryReport): Promise<void> {
    await this.database.db.insert(telemetryReports).values({
      day: report.day,
      payload: JSON.stringify(report.payload),
      status: report.status,
      attempts: report.attempts,
      createdAt: report.createdAt,
      sentAt: report.sentAt,
    });
  }

  async list(): Promise<StoredTelemetryReport[]> {
    const rows = await this.database.db
      .select()
      .from(telemetryReports)
      .orderBy(desc(telemetryReports.day));
    return rows.map((row) => ({
      day: row.day,
      status: row.status,
      attempts: row.attempts,
      createdAt: row.createdAt,
      sentAt: row.sentAt,
      payload: TelemetryReportV1Schema.parse(JSON.parse(row.payload)),
    }));
  }

  async deleteUnsent(): Promise<void> {
    await this.database.db.delete(telemetryReports).where(ne(telemetryReports.status, 'SENT'));
  }
}

@Injectable()
export class DrizzleTelemetryActivityRepository extends TelemetryActivityRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async record(day: string): Promise<void> {
    await this.database.db.insert(telemetryActivityDays).values({ day }).onConflictDoNothing();
  }

  async daysBetween(from: string, to: string): Promise<string[]> {
    const rows = await this.database.db
      .select()
      .from(telemetryActivityDays)
      .where(between(telemetryActivityDays.day, from, to))
      .orderBy(asc(telemetryActivityDays.day));
    return rows.map((row) => row.day);
  }

  async has(day: string): Promise<boolean> {
    const row = await this.database.db
      .select()
      .from(telemetryActivityDays)
      .where(eq(telemetryActivityDays.day, day))
      .get();
    return row !== undefined;
  }
}
