import { z } from 'zod';
import { ApplicationStatusSchema } from './applications.js';

/*
 * Dashboard of applications (REQUIREMENTS §5.7, roadmap 8.1): how many there are in each state, how many of the
 * sent ones got an answer and how long the first answer took.
 */

/** Which applications the response metrics cover, by the day they were sent: the last 30 or 90 days, or all. */
export const DashboardPeriodSchema = z.enum(['30d', '90d', 'all']);
export type DashboardPeriod = z.infer<typeof DashboardPeriodSchema>;

/** `GET /dashboard/summary?period=…`; all of them by default. */
export const DashboardSummaryQuerySchema = z.object({
  period: DashboardPeriodSchema.default('all'),
});
export type DashboardSummaryQuery = z.infer<typeof DashboardSummaryQuerySchema>;

const Count = z.number().int().nonnegative();

/**
 * `GET /dashboard/summary` (RF-DASH-01, RF-DASH-02):
 * - `byStatus` and `total`: every application by its current state, whatever the period.
 * - `sent`: the applications sent in the period (they reached `APPLIED` or later).
 * - `responded`: those of them the company answered: at some point they reached `SCREENING`, `INTERVIEWING`,
 *   `OFFER`, `ACCEPTED` or `REJECTED`. Being ghosted or withdrawn is not an answer.
 * - `responseRate`: `responded / sent`, from 0 to 1; `null` when none was sent.
 * - `medianDaysToFirstResponse`: median of the days from sending each one to its first answer; `null` when
 *   none was answered.
 */
export const DashboardSummarySchema = z.object({
  period: DashboardPeriodSchema,
  byStatus: z.record(ApplicationStatusSchema, Count),
  total: Count,
  sent: Count,
  responded: Count,
  responseRate: z.number().min(0).max(1).nullable(),
  medianDaysToFirstResponse: z.number().nonnegative().nullable(),
});
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
