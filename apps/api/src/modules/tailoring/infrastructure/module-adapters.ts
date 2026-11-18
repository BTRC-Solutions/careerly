import type {
  JobAnalysis,
  JobView,
  Profile,
  ProfileChangeEntity,
  RevertProfileChangesResult,
  SessionProfileChange,
  ToolRef,
} from '@careerly/contracts';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  AiBlockedError,
  AiKeyRejectedError,
  AiNotConfiguredError,
  AiProviderNotSupportedError,
} from '../../ai/index.js';
import { JobAnalysisService, JobPostingNotFoundError } from '../../job-postings/index.js';
import { JobQueue, JobRunner, PermanentJobError } from '../../jobs/index.js';
import { ProfileChangesService, ProfileService, ToolCatalogService } from '../../profile/index.js';
import { TailoringSessionsService } from '../application/tailoring-sessions.service.js';
import {
  JobDescriptionNotReadyError,
  JobDescriptionReader,
  MatchQueue,
  ProfileChangeLog,
  ProfileReader,
  TailoringJobPostingNotFoundError,
  TailoringSessionNotFoundError,
  ToolResolver,
} from '../application/tailoring.ports.js';

export const TAILORING_MATCH_JOB = 'tailoring-match';

const dedupeKey = (sessionId: string) => `${TAILORING_MATCH_JOB}:${sessionId}`;

/** The master profile through the profile module's public service. */
@Injectable()
export class ProfileModuleReader extends ProfileReader {
  constructor(private readonly profile: ProfileService) {
    super();
  }

  read(): Promise<Profile> {
    return this.profile.getProfile();
  }
}

const ENTITIES = {
  position: 'POSITION',
  project: 'PROJECT',
  achievement: 'ACHIEVEMENT',
} as const satisfies Record<string, ProfileChangeEntity>;

/** The session's profile writes through the profile module's change log. */
@Injectable()
export class ProfileModuleChangeLog extends ProfileChangeLog {
  constructor(private readonly changes: ProfileChangesService) {
    super();
  }

  async list(sessionId: string): Promise<SessionProfileChange[]> {
    return (await this.changes.listChanges(sessionId)).map((change) => ({
      id: change.id,
      entity: ENTITIES[change.entity],
      entityId: change.entityId,
      kind: change.kind,
      createdAt: change.createdAt,
      revertedAt: change.revertedAt,
    }));
  }

  async revert(
    sessionId: string,
    changeIds?: string[],
  ): Promise<RevertProfileChangesResult['keptFields']> {
    const plan = await this.changes.revert(sessionId, changeIds);
    return plan.keptFields.map(({ entity, entityId, fields }) => ({
      entity: ENTITIES[entity],
      entityId,
      fields,
    }));
  }
}

/** Tool names through the profile module's catalog (aliases included). */
@Injectable()
export class CatalogToolResolver extends ToolResolver {
  constructor(private readonly catalog: ToolCatalogService) {
    super();
  }

  async resolve(name: string): Promise<ToolRef | null> {
    const tool = await this.catalog.resolve(name);
    return tool ? { id: tool.id, name: tool.name } : null;
  }
}

/** The job description's analysis through the job-postings module. */
@Injectable()
export class JobPostingsModuleReader extends JobDescriptionReader {
  constructor(private readonly analyses: JobAnalysisService) {
    super();
  }

  async analysis(jobPostingId: string): Promise<JobAnalysis> {
    let state;
    try {
      state = await this.analyses.state(jobPostingId);
    } catch (error) {
      if (error instanceof JobPostingNotFoundError) {
        throw new TailoringJobPostingNotFoundError(jobPostingId);
      }
      throw error;
    }
    if (state.job && (state.job.status === 'PENDING' || state.job.status === 'RUNNING')) {
      throw new JobDescriptionNotReadyError(jobPostingId, 'ANALYZING');
    }
    if (!state.analysis) throw new JobDescriptionNotReadyError(jobPostingId, 'NOT_ANALYZED');
    return state.analysis;
  }
}

/** Matches run as `tailoring-match` jobs, one per session (retrying restarts it). */
@Injectable()
export class JobQueueMatchQueue extends MatchQueue {
  constructor(private readonly queue: JobQueue) {
    super();
  }

  request(sessionId: string): JobView {
    return this.queue.enqueue({
      type: TAILORING_MATCH_JOB,
      payload: { sessionId },
      dedupeKey: dedupeKey(sessionId),
      maxAttempts: MatchQueue.MAX_ATTEMPTS,
      restartFinished: true,
    });
  }

  current(sessionId: string): JobView | null {
    return this.queue.findByDedupeKey(dedupeKey(sessionId));
  }
}

/**
 * Runs `tailoring-match` jobs. A deleted session or job description, a missing or rejected key and blocked
 * content fail at once; rate limits, outages and invalid answers are retried. When the job gives up, the
 * session goes to `FAILED` so the user can retry it.
 */
@Injectable()
export class TailoringMatchJobHandler implements OnModuleInit {
  constructor(
    private readonly runner: JobRunner,
    private readonly sessions: TailoringSessionsService,
  ) {}

  onModuleInit(): void {
    this.runner.register({
      type: TAILORING_MATCH_JOB,
      run: async (payload, context) => {
        const sessionId = (payload as { sessionId?: unknown } | null)?.sessionId;
        if (typeof sessionId !== 'string') throw new PermanentJobError('INVALID_PAYLOAD');
        try {
          await this.sessions.runMatch(sessionId, context.report);
        } catch (error) {
          const fatal = permanent(error);
          if (fatal || context.attempt >= MatchQueue.MAX_ATTEMPTS) {
            await this.sessions.markMatchFailed(sessionId);
          }
          throw fatal ?? error;
        }
      },
    });
  }
}

function permanent(error: unknown): PermanentJobError | null {
  if (error instanceof TailoringSessionNotFoundError) {
    return new PermanentJobError('TAILORING_SESSION_DELETED');
  }
  if (error instanceof TailoringJobPostingNotFoundError) {
    return new PermanentJobError('JOB_POSTING_DELETED');
  }
  if (error instanceof JobDescriptionNotReadyError) return new PermanentJobError(error.reason);
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
