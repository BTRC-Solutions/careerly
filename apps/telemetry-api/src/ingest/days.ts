import { TELEMETRY_MAX_DAYS_BACK } from '@careerly/contracts';

/** The UTC day (`YYYY-MM-DD`) of an instant. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** `day` moved `days` days (UTC calendar). */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return utcDay(date);
}

/**
 * Whether a report's day can be accepted (ARCHITECTURE §19.4): from 30 days before the UTC day up to the next
 * UTC day, since the report's day is the installation's local one, which ahead of UTC may already be tomorrow.
 * It is not bounded by the registration: the first request brings the days kept since the user accepted.
 */
export function isDayInWindow(day: string, now: Date): boolean {
  const today = utcDay(now);
  return day >= addDays(today, -TELEMETRY_MAX_DAYS_BACK) && day <= addDays(today, 1);
}

/** Seconds until the next UTC midnight, for `Retry-After` of what resets each day. */
export function secondsToNextUtcDay(now: Date): number {
  const next = new Date(`${addDays(utcDay(now), 1)}T00:00:00.000Z`);
  return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 1000));
}
