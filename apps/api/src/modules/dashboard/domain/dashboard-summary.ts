/*
 * Dashboard metrics of applications (RF-DASH-01, RF-DASH-02, roadmap 8.1). Pure: callers pass the days already
 * in the user's time zone.
 */

import {
  type ApplicationStatus,
  ApplicationStatusSchema,
  type DashboardPeriod,
  type DashboardSummary,
} from '@careerly/contracts';

/** One application as the dashboard sees it. Days are YYYY-MM-DD in the user's time zone. */
export interface DatedHistory {
  status: ApplicationStatus;
  /** The day it was sent, or `null` if it was not. */
  appliedAt: string | null;
  /** Its changes of state, oldest first. */
  statusChanges: { to: ApplicationStatus; day: string }[];
}

/** Reaching any of these means the company answered; being ghosted or withdrawn does not. */
const RESPONSE_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  'SCREENING',
  'INTERVIEWING',
  'OFFER',
  'ACCEPTED',
  'REJECTED',
]);

const PERIOD_DAYS: Record<Exclude<DashboardPeriod, 'all'>, number> = { '30d': 30, '90d': 90 };

const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);

/**
 * Counts every application by its current state; the response rate and the median days to the first answer
 * cover those sent in the period (the last N days, today included). An answer recorded before the day it was
 * sent counts as the same day.
 */
export function summarizeApplications(
  histories: readonly DatedHistory[],
  period: DashboardPeriod,
  today: string,
): DashboardSummary {
  const byStatus = Object.fromEntries(
    ApplicationStatusSchema.options.map((status) => [status, 0]),
  ) as Record<ApplicationStatus, number>;
  for (const { status } of histories) byStatus[status] += 1;

  const since = period === 'all' ? null : dayNumber(today) - PERIOD_DAYS[period] + 1;
  const sent = histories.filter(
    (history): history is DatedHistory & { appliedAt: string } =>
      history.appliedAt !== null && (since === null || dayNumber(history.appliedAt) >= since),
  );

  const waits: number[] = [];
  for (const { appliedAt, statusChanges } of sent) {
    const answer = statusChanges.find((change) => RESPONSE_STATUSES.has(change.to));
    if (answer) waits.push(Math.max(0, dayNumber(answer.day) - dayNumber(appliedAt)));
  }

  return {
    period,
    byStatus,
    total: histories.length,
    sent: sent.length,
    responded: waits.length,
    responseRate: sent.length === 0 ? null : waits.length / sent.length,
    medianDaysToFirstResponse: median(waits),
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
