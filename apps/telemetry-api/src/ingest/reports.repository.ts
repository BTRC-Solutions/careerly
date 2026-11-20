import type { TelemetryReportV1 } from '@careerly/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { installs, reports, sends } from '../database/schema.js';
import { APP_DEPS, type AppDeps } from '../deps.js';

export interface Installation {
  publicKey: string;
}

/** Another request of the installation got in first today. */
export class AlreadySentTodayError extends Error {}

/** Installations, reports and the daily send mark in Postgres. */
@Injectable()
export class ReportsRepository {
  constructor(@Inject(APP_DEPS) private readonly deps: AppDeps) {}

  async installation(installId: string): Promise<Installation | null> {
    const [row] = await this.deps.db
      .select({ publicKey: installs.publicKey })
      .from(installs)
      .where(eq(installs.installId, installId));
    return row ?? null;
  }

  async sentOn(installId: string, utcDay: string): Promise<boolean> {
    const [row] = await this.deps.db
      .select({ installId: sends.installId })
      .from(sends)
      .where(and(eq(sends.installId, installId), eq(sends.utcDay, utcDay)));
    return row !== undefined;
  }

  /**
   * In one transaction: the installation when it is new, today's send mark and each report whose day is new
   * (the first one wins). Returns the days stored. Throws {@link AlreadySentTodayError} when the mark exists.
   */
  async store(input: {
    installId: string;
    utcDay: string;
    newPublicKey: string | null;
    reports: TelemetryReportV1[];
  }): Promise<string[]> {
    return this.deps.db.transaction(async (tx) => {
      if (input.newPublicKey !== null) {
        const registered = await tx
          .insert(installs)
          .values({
            installId: input.installId,
            publicKey: input.newPublicKey,
            registeredOn: input.utcDay,
          })
          .onConflictDoNothing()
          .returning({ installId: installs.installId });
        // Another request registered it a moment ago: that one is today's.
        if (registered.length === 0) throw new AlreadySentTodayError();
      }
      const marked = await tx
        .insert(sends)
        .values({ installId: input.installId, utcDay: input.utcDay })
        .onConflictDoNothing()
        .returning({ installId: sends.installId });
      if (marked.length === 0) throw new AlreadySentTodayError();

      const stored = await tx
        .insert(reports)
        .values(
          input.reports.map((report) => ({
            installId: input.installId,
            day: report.day,
            schemaVersion: report.schemaVersion,
            appVersion: report.appVersion,
            metrics: report.metrics,
          })),
        )
        .onConflictDoNothing()
        .returning({ day: reports.day });
      return stored.map((row) => row.day);
    });
  }
}
