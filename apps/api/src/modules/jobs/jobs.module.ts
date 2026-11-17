import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../platform/config/app-config.js';
import { JobEvents } from './application/job-events.js';
import { JobQueue } from './application/job-queue.js';
import { JOB_RUNNER_OPTIONS, JobRunner } from './application/job-runner.js';
import { JobRepository } from './application/jobs.ports.js';
import { JobsController } from './http/jobs.controller.js';
import { SqliteJobRepository } from './infrastructure/sqlite-job.repository.js';

/**
 * Background jobs (ARCHITECTURE §10): a queue persisted in SQLite and its executor, in the backend process.
 * Modules enqueue with `JobQueue` and run their job types with a handler registered in `JobRunner`.
 */
@Module({
  controllers: [JobsController],
  providers: [
    JobEvents,
    JobQueue,
    JobRunner,
    {
      provide: JOB_RUNNER_OPTIONS,
      useFactory: (config: AppConfig) => ({ retryBaseMs: config.jobRetryBaseMs }),
      inject: [APP_CONFIG],
    },
    { provide: JobRepository, useClass: SqliteJobRepository },
  ],
  exports: [JobQueue, JobRunner],
})
export class JobsModule {}
