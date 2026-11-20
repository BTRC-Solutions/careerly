import type { DashboardPeriod, DashboardSummary } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { summarizeApplications } from '../domain/dashboard-summary.js';
import { ApplicationTracksReader } from './dashboard.ports.js';

/** Aggregated reads for the home screen (ARCHITECTURE §4: no domain of its own, read only). */
@Injectable()
export class DashboardService {
  constructor(private readonly applications: ApplicationTracksReader) {}

  async summary(period: DashboardPeriod, now = new Date()): Promise<DashboardSummary> {
    const tracks = await this.applications.all();
    return summarizeApplications(
      tracks.map(({ status, appliedAt, statusChanges }) => ({
        status,
        appliedAt,
        statusChanges: statusChanges.map(({ to, occurredAt }) => ({
          to,
          day: localDay(new Date(occurredAt)),
        })),
      })),
      period,
      localDay(now),
    );
  }
}

/** The day in the local time zone of the computer (YYYY-MM-DD), as `appliedAt` is recorded. */
function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
