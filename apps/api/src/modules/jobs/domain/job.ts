import type { JobStatus } from '@careerly/contracts';

/** A job as stored (ARCHITECTURE §10). */
export interface JobRecord {
  id: string;
  type: string;
  /** Parsed JSON: ids only, never content. */
  payload: unknown;
  dedupeKey: string | null;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export const DEFAULT_MAX_ATTEMPTS = 3;
/** Retries wait at most this long, whatever the attempt. */
export const MAX_RETRY_DELAY_MS = 5 * 60_000;

/** Exponential backoff: `base`, `2 × base`, `4 × base`… after the 1st, 2nd, 3rd… failed attempt. */
export function retryDelayMs(failedAttempt: number, baseMs: number): number {
  return Math.min(baseMs * 2 ** Math.max(0, failedAttempt - 1), MAX_RETRY_DELAY_MS);
}

/**
 * What to do after an attempt failed: try again later, or give up. `delayMs`, when the handler asked for a
 * specific wait (e.g. the server's `Retry-After`), replaces the exponential backoff.
 */
export function afterFailure(
  job: Pick<JobRecord, 'attempts' | 'maxAttempts'>,
  permanent: boolean,
  now: Date,
  baseMs: number,
  delayMs?: number,
): { retry: false } | { retry: true; runAt: string } {
  if (permanent || job.attempts >= job.maxAttempts) return { retry: false };
  const wait = delayMs ?? retryDelayMs(job.attempts, baseMs);
  return { retry: true, runAt: new Date(now.getTime() + wait).toISOString() };
}

/**
 * What is recorded about an error: its code (`AiError.code`) or class name, never its message, which could
 * quote profile or job description content (RNF-02).
 */
export function errorCodeOf(error: unknown): string {
  const code =
    error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : error instanceof Error
        ? error.name
        : 'UnknownError';
  return code.slice(0, 80);
}
