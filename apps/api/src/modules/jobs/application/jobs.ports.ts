import type { JobRecord } from '../domain/job.js';

export interface NewJob {
  id: string;
  type: string;
  payload: unknown;
  dedupeKey: string | null;
  maxAttempts: number;
  now: string;
}

/**
 * Port: the persisted queue (ARCHITECTURE §10). Synchronous on purpose: enqueueing can then happen inside
 * another module's `inTransaction()`, and claiming a job is atomic in the single backend process.
 * An abstract class so it can be used as a Nest DI token.
 */
export abstract class JobRepository {
  /** Inserts the job, or returns the one with the same `dedupeKey` (a failed one goes back to pending). */
  abstract enqueue(job: NewJob): JobRecord;
  abstract findById(id: string): JobRecord | null;
  /** Takes the next due pending job of one of these types: it becomes `RUNNING` with one more attempt. */
  abstract claimNext(types: string[], now: string): JobRecord | null;
  abstract markSucceeded(id: string, now: string): void;
  abstract markRetry(id: string, runAt: string, error: string, now: string): void;
  abstract markFailed(id: string, error: string, now: string): void;
  /** Jobs left `RUNNING` by a closed app go back to `PENDING`; returns how many. */
  abstract requeueRunning(now: string): number;
}

export class JobNotFoundError extends Error {
  constructor(readonly jobId: string) {
    super(`Job "${jobId}" does not exist.`);
    this.name = 'JobNotFoundError';
  }
}

/** Thrown by a handler when retrying cannot help (e.g. the session it works on was deleted). */
export class PermanentJobError extends Error {
  constructor(
    /** Recorded as the job's `lastError`, like any error code. */
    readonly code: string,
  ) {
    super(`Job failed permanently: ${code}`);
    this.name = 'PermanentJobError';
  }
}
