import { randomUUID } from 'node:crypto';
import type { JobView } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { DEFAULT_MAX_ATTEMPTS, type JobRecord } from '../domain/job.js';
import { JobEvents } from './job-events.js';
import { JobNotFoundError, JobRepository } from './jobs.ports.js';

export interface EnqueueRequest {
  type: string;
  /** Ids only, never content: the handler reads what it needs from its module. */
  payload: unknown;
  /** Enqueueing again with the same key returns the same job (e.g. `<sessionId>:<step>`). */
  dedupeKey?: string;
  maxAttempts?: number;
  /** With `dedupeKey`: run a job that already succeeded again (e.g. "analyze again"). */
  restartFinished?: boolean;
}

/** Wakes the runner when a job is enqueued; set by `JobRunner`. */
type Wake = () => void;

/**
 * Entry point to put work in the background queue (ARCHITECTURE §10). `enqueue` is synchronous, so it can
 * run inside the same `inTransaction()` as the state change that needs the job.
 */
@Injectable()
export class JobQueue {
  private wake: Wake = () => {};

  constructor(
    private readonly jobs: JobRepository,
    private readonly events: JobEvents,
  ) {}

  onEnqueue(wake: Wake): void {
    this.wake = wake;
  }

  enqueue(request: EnqueueRequest): JobView {
    const job = this.jobs.enqueue({
      id: randomUUID(),
      type: request.type,
      payload: request.payload ?? null,
      dedupeKey: request.dedupeKey ?? null,
      maxAttempts: request.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      restartFinished: request.restartFinished ?? false,
      now: new Date().toISOString(),
    });
    // After the caller's transaction commits: the runner reads the job on its next turn.
    queueMicrotask(this.wake);
    return this.toView(job);
  }

  get(id: string): JobView {
    const job = this.jobs.findById(id);
    if (!job) throw new JobNotFoundError(id);
    return this.toView(job);
  }

  /** The job enqueued with this dedupe key, if any. */
  findByDedupeKey(dedupeKey: string): JobView | null {
    const job = this.jobs.findByDedupeKey(dedupeKey);
    return job ? this.toView(job) : null;
  }

  toView(job: JobRecord): JobView {
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      lastError: job.lastError,
      progress: job.status === 'RUNNING' ? this.events.lastProgress(job.id) : null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      finishedAt: job.finishedAt,
    };
  }
}
