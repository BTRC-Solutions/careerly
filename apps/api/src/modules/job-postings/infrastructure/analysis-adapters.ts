import type { JobView } from '@careerly/contracts';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  AiBlockedError,
  AiKeyRejectedError,
  AiNotConfiguredError,
  AiProviderNotSupportedError,
} from '../../ai/index.js';
import { JobQueue, JobRunner, PermanentJobError } from '../../jobs/index.js';
import { ToolCatalogService } from '../../profile/index.js';
import { AnalysisQueue, ToolMatcher } from '../application/job-analysis.ports.js';
import { JobAnalysisService } from '../application/job-analysis.service.js';
import { JobPostingNotFoundError } from '../application/job-postings.repository.js';

export const JD_ANALYSIS_JOB = 'jd-analysis';

const dedupeKey = (jobPostingId: string) => `${JD_ANALYSIS_JOB}:${jobPostingId}`;

/** Tool matching through the profile module's public catalog service. */
@Injectable()
export class CatalogToolMatcher extends ToolMatcher {
  constructor(private readonly catalog: ToolCatalogService) {
    super();
  }

  async match(name: string) {
    const tool = await this.catalog.resolve(name);
    return tool ? { id: tool.id, name: tool.name } : null;
  }
}

/** Analyses run as `jd-analysis` jobs, one per posting (analyzing again restarts it). */
@Injectable()
export class JobQueueAnalysisQueue extends AnalysisQueue {
  constructor(private readonly queue: JobQueue) {
    super();
  }

  request(jobPostingId: string): JobView {
    return this.queue.enqueue({
      type: JD_ANALYSIS_JOB,
      payload: { jobPostingId },
      dedupeKey: dedupeKey(jobPostingId),
      restartFinished: true,
    });
  }

  current(jobPostingId: string): JobView | null {
    return this.queue.findByDedupeKey(dedupeKey(jobPostingId));
  }
}

/**
 * Runs `jd-analysis` jobs. Retrying cannot fix a deleted posting, a missing or rejected key, or content
 * the provider blocks: those fail at once. Rate limits, outages and invalid answers are retried.
 */
@Injectable()
export class JdAnalysisJobHandler implements OnModuleInit {
  constructor(
    private readonly runner: JobRunner,
    private readonly analyses: JobAnalysisService,
  ) {}

  onModuleInit(): void {
    this.runner.register({
      type: JD_ANALYSIS_JOB,
      run: async (payload, context) => {
        const jobPostingId = (payload as { jobPostingId?: unknown } | null)?.jobPostingId;
        if (typeof jobPostingId !== 'string') throw new PermanentJobError('INVALID_PAYLOAD');
        try {
          await this.analyses.run(jobPostingId, context.report);
        } catch (error) {
          throw permanent(error) ?? error;
        }
      },
    });
  }
}

function permanent(error: unknown): PermanentJobError | null {
  if (error instanceof JobPostingNotFoundError) return new PermanentJobError('JOB_POSTING_DELETED');
  if (
    error instanceof AiNotConfiguredError ||
    error instanceof AiProviderNotSupportedError ||
    error instanceof AiKeyRejectedError ||
    error instanceof AiBlockedError
  ) {
    return new PermanentJobError(error.code);
  }
  return null;
}
