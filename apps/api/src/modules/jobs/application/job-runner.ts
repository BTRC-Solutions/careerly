import type { JobProgress } from '@careerly/contracts';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { afterFailure, errorCodeOf, type JobRecord } from '../domain/job.js';
import { JobEvents } from './job-events.js';
import { JobQueue } from './job-queue.js';
import { JobRepository, PermanentJobError, RetryLaterError } from './jobs.ports.js';

/** Jobs run at the same time (most of the time they wait on the network or on Typst). */
const CONCURRENCY = 2;
/** How often the queue is checked when nothing wakes the runner (retries that became due). */
const POLL_MS = 1000;

/** DI token for {@link JobRunnerOptions}. */
export const JOB_RUNNER_OPTIONS = Symbol('JOB_RUNNER_OPTIONS');

export interface JobRunnerOptions {
  /** First retry delay; it doubles on each failed attempt. */
  retryBaseMs: number;
}

export interface JobContext {
  jobId: string;
  /** 1 for the first try. */
  attempt: number;
  /** Progress for the interface; kept in memory only. */
  report(progress: Partial<JobProgress>): void;
}

/**
 * Runs one type of job. Handlers must be idempotent: after a crash or a closed app, an attempt can run
 * again from the start. Throw `PermanentJobError` when retrying cannot help.
 */
export interface JobHandler {
  type: string;
  run(payload: unknown, context: JobContext): Promise<void>;
}

/**
 * The executor (ARCHITECTURE §10): runs pending jobs of the registered types, a few at a time, retrying
 * with exponential backoff. At startup, jobs a closed app left `RUNNING` go back to `PENDING` and run
 * again (RNF-13). On shutdown, attempts still running are not written: they resume on the next start.
 */
@Injectable()
export class JobRunner implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobRunner.name);
  private readonly handlers = new Map<string, JobHandler>();
  private readonly running = new Set<string>();
  private timer: NodeJS.Timeout | undefined;
  private started = false;
  private stopped = false;

  constructor(
    @Inject(JOB_RUNNER_OPTIONS) private readonly options: JobRunnerOptions,
    private readonly jobs: JobRepository,
    private readonly queue: JobQueue,
    private readonly events: JobEvents,
  ) {
    queue.onEnqueue(() => this.tick());
  }

  /** Called by the module that owns a job type, usually from its `onModuleInit`. */
  register(handler: JobHandler): void {
    if (this.handlers.has(handler.type)) {
      throw new Error(`A handler for "${handler.type}" jobs is already registered.`);
    }
    this.handlers.set(handler.type, handler);
    this.tick();
  }

  onApplicationBootstrap(): void {
    const requeued = this.jobs.requeueRunning(new Date().toISOString());
    if (requeued > 0) this.logger.log(`Resuming ${requeued} job(s) interrupted by a shutdown.`);
    this.started = true;
    this.tick();
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  /** Starts due jobs while there is room, then checks again later. */
  private tick(): void {
    if (!this.started || this.stopped) return;
    clearTimeout(this.timer);
    try {
      while (this.running.size < CONCURRENCY && this.handlers.size > 0) {
        const job = this.jobs.claimNext([...this.handlers.keys()], new Date().toISOString());
        if (!job) break;
        void this.run(job);
      }
    } catch (error) {
      // e.g. the database is being replaced by a restore: try again on the next turn.
      this.logger.warn(`Could not read the job queue: ${errorCodeOf(error)}`);
    }
    this.timer = setTimeout(() => this.tick(), POLL_MS);
    this.timer.unref();
  }

  private async run(job: JobRecord): Promise<void> {
    const handler = this.handlers.get(job.type)!;
    this.running.add(job.id);
    this.events.emit({ kind: 'started', jobId: job.id, attempt: job.attempts });
    try {
      await handler.run(job.payload, {
        jobId: job.id,
        attempt: job.attempts,
        report: (progress) => {
          if (this.stopped) return;
          this.events.emit({
            kind: 'progress',
            jobId: job.id,
            progress: { step: null, done: null, total: null, ...progress },
          });
        },
      });
      if (this.stopped) return;
      this.jobs.markSucceeded(job.id, new Date().toISOString());
      this.events.emit({ kind: 'succeeded', jobId: job.id });
    } catch (error) {
      if (this.stopped) return;
      this.fail(job, error);
    } finally {
      this.running.delete(job.id);
      this.tick();
    }
  }

  private fail(job: JobRecord, error: unknown): void {
    const code = errorCodeOf(error);
    const now = new Date();
    const next = afterFailure(
      job,
      error instanceof PermanentJobError,
      now,
      this.options.retryBaseMs,
      error instanceof RetryLaterError ? error.delayMs : undefined,
    );
    try {
      if (next.retry) {
        this.jobs.markRetry(job.id, next.runAt, code, now.toISOString());
        this.events.emit({ kind: 'retrying', jobId: job.id, error: code, runAt: next.runAt });
      } else {
        this.jobs.markFailed(job.id, code, now.toISOString());
        this.logger.warn(`Job "${job.type}" failed after ${job.attempts} attempt(s): ${code}`);
        this.events.emit({ kind: 'failed', jobId: job.id, error: code });
      }
    } catch (writeError) {
      this.logger.error(`Could not record the outcome of a job: ${errorCodeOf(writeError)}`);
    }
  }
}
