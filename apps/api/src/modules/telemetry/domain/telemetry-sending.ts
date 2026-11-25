/**
 * Pure rules of sending the reports (ARCHITECTURE §19.2): the receiver counts days in UTC, and the client
 * retries with growing waits plus jitter, never sooner than the receiver's `Retry-After`.
 */

/** Waits after the 1st, 2nd, 3rd and 4th failed attempt of the day (the 5th is the last). */
export const SEND_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

/** Attempts per UTC day: the first one plus a retry for each delay. */
export const SEND_ATTEMPTS_PER_DAY = SEND_RETRY_DELAYS_MS.length + 1;

/** The UTC day (`YYYY-MM-DD`) of an instant: the receiver's day, which limits one request per day. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** `day` moved `days` days on the UTC calendar. */
export function addUtcDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return utcDay(date);
}

/**
 * How long to wait after the `failedAttempt`-th attempt (1-based): the schedule ±20 % so installations that
 * failed together do not come back together, and at least what `Retry-After` asked for.
 */
export function sendRetryDelayMs(
  failedAttempt: number,
  retryAfterSeconds: number | null,
  random: () => number = Math.random,
): number {
  const base = SEND_RETRY_DELAYS_MS[Math.min(failedAttempt, SEND_RETRY_DELAYS_MS.length) - 1]!;
  const jittered = Math.round(base * (0.8 + 0.4 * random()));
  return Math.max(jittered, (retryAfterSeconds ?? 0) * 1000);
}
