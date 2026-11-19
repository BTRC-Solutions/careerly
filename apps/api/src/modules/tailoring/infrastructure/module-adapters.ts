import type {
  Evidence,
  JobAnalysis,
  JobView,
  Profile,
  ProfileChangeEntity,
  ProjectKind,
  ResumeDocument,
  ResumeVersion,
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
import {
  RenderError,
  ResumeRenderService,
  ResumeVersionsService,
  TemplateNotFoundError,
} from '../../documents/index.js';
import {
  JobAnalysisService,
  JobPostingNotFoundError,
  JobPostingsService,
} from '../../job-postings/index.js';
import { JobQueue, JobRunner, PermanentJobError } from '../../jobs/index.js';
import { ProfileChangesService, ProfileService, ToolCatalogService } from '../../profile/index.js';
import { TailoringSessionsService } from '../application/tailoring-sessions.service.js';
import {
  GenerateQueue,
  JobDescriptionNotReadyError,
  JobDescriptionReader,
  MatchQueue,
  ProfileChangeLog,
  ProfileReader,
  ResumePdfRenderer,
  ResumeRenderFailedError,
  type ResumeToFreeze,
  ResumeVersionStore,
  ProfileWriter,
  TailoringJobPostingNotFoundError,
  TailoringSessionNotFoundError,
  TemplateLookup,
  ToolResolver,
  ToolVocabulary,
} from '../application/tailoring.ports.js';
import { ResumeWithoutNameError } from '../domain/resume-writing.js';
import type { ToolTerm } from '../domain/truth-guard.js';

export const TAILORING_MATCH_JOB = 'tailoring-match';
export const TAILORING_GENERATE_JOB = 'tailoring-generate';

const dedupeKey = (sessionId: string) => `${TAILORING_MATCH_JOB}:${sessionId}`;
const generateDedupeKey = (sessionId: string) => `${TAILORING_GENERATE_JOB}:${sessionId}`;

/** CVs rendered through the documents module. */
@Injectable()
export class DocumentsModuleRenderer extends ResumePdfRenderer {
  constructor(private readonly renderService: ResumeRenderService) {
    super();
  }

  async render(document: ResumeDocument, templateId: string) {
    try {
      const { pdf, pageCount } = await this.renderService.render(document, templateId);
      return { pdf, pageCount };
    } catch (error) {
      throw toRenderFailure(error);
    }
  }
}

/** The documents module's render errors as this module's. */
function toRenderFailure(error: unknown): unknown {
  if (error instanceof TemplateNotFoundError) {
    return new ResumeRenderFailedError('TEMPLATE_NOT_FOUND', error.message);
  }
  if (error instanceof RenderError) {
    return new ResumeRenderFailedError(error.reason, error.message, error.diagnostics);
  }
  return error;
}

/** Finalized CVs through the documents module (RF-TAIL-14). */
@Injectable()
export class DocumentsModuleVersionStore extends ResumeVersionStore {
  constructor(private readonly versions: ResumeVersionsService) {
    super();
  }

  async freeze(
    sessionId: string,
    templateId: string,
    resumes: ResumeToFreeze[],
  ): Promise<ResumeVersion[]> {
    try {
      return await this.versions.finalize(sessionId, templateId, resumes);
    } catch (error) {
      throw toRenderFailure(error);
    }
  }

  list(sessionId: string): Promise<ResumeVersion[]> {
    return this.versions.listBySession(sessionId);
  }
}

/** CVs are written as `tailoring-generate` jobs, one per session (regenerating restarts it). */
@Injectable()
export class JobQueueGenerateQueue extends GenerateQueue {
  constructor(private readonly queue: JobQueue) {
    super();
  }

  request(sessionId: string): JobView {
    return this.queue.enqueue({
      type: TAILORING_GENERATE_JOB,
      payload: { sessionId },
      dedupeKey: generateDedupeKey(sessionId),
      maxAttempts: GenerateQueue.MAX_ATTEMPTS,
      restartFinished: true,
    });
  }

  current(sessionId: string): JobView | null {
    return this.queue.findByDedupeKey(generateDedupeKey(sessionId));
  }
}

/**
 * Runs `tailoring-generate` jobs, with the same failure rules as the match: what cannot get better fails at
 * once, the rest is retried, and when the job gives up the session goes to `FAILED`.
 */
@Injectable()
export class TailoringGenerateJobHandler implements OnModuleInit {
  constructor(
    private readonly runner: JobRunner,
    private readonly sessions: TailoringSessionsService,
  ) {}

  onModuleInit(): void {
    this.runner.register({
      type: TAILORING_GENERATE_JOB,
      run: async (payload, context) => {
        const sessionId = (payload as { sessionId?: unknown } | null)?.sessionId;
        if (typeof sessionId !== 'string') throw new PermanentJobError('INVALID_PAYLOAD');
        try {
          await this.sessions.runGenerate(sessionId, context.report);
        } catch (error) {
          const fatal = permanent(error);
          if (fatal || context.attempt >= GenerateQueue.MAX_ATTEMPTS) {
            await this.sessions.markGenerateFailed(sessionId);
          }
          throw fatal ?? error;
        }
      },
    });
  }
}

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

const CHANGED_ENTITY = {
  ACHIEVEMENT: 'achievement',
  PROJECT: 'project',
  POSITION: 'position',
} as const;

/** Gap answers written to the profile through its change log, so the session can undo them. */
@Injectable()
export class ProfileModuleWriter extends ProfileWriter {
  constructor(private readonly changes: ProfileChangesService) {
    super();
  }

  async createAchievement(
    sessionId: string,
    parent: { kind: 'position' | 'project'; id: string },
    achievement: { text: string; toolIds: string[] },
  ): Promise<string> {
    const created = await this.changes.createAchievement(sessionId, parent, {
      ...achievement,
      metrics: null,
    });
    return created.id;
  }

  async createProject(
    sessionId: string,
    project: { name: string; kind: ProjectKind; toolIds: string[] },
  ): Promise<string> {
    const created = await this.changes.createProject(sessionId, {
      ...project,
      role: null,
      url: null,
      startDate: null,
      endDate: null,
      description: null,
    });
    return created.id;
  }

  async undo(sessionId: string, created: Evidence[]): Promise<void> {
    const wanted = new Set(
      created.flatMap((item) =>
        item.kind in CHANGED_ENTITY
          ? [`${CHANGED_ENTITY[item.kind as keyof typeof CHANGED_ENTITY]}:${item.id}`]
          : [],
      ),
    );
    const changeIds = (await this.changes.listChanges(sessionId))
      .filter(
        (change) => change.revertedAt === null && wanted.has(`${change.entity}:${change.entityId}`),
      )
      .map((change) => change.id);
    if (changeIds.length > 0) await this.changes.revert(sessionId, changeIds);
  }
}

/** CV templates through the documents module. */
@Injectable()
export class DocumentsTemplateLookup extends TemplateLookup {
  constructor(private readonly render: ResumeRenderService) {
    super();
  }

  exists(templateId: string): Promise<boolean> {
    return this.render.hasTemplate(templateId);
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

/** The names and aliases of the profile module's tool catalog. */
@Injectable()
export class CatalogToolVocabulary extends ToolVocabulary {
  constructor(private readonly catalog: ToolCatalogService) {
    super();
  }

  async terms(): Promise<ToolTerm[]> {
    const tools = await this.catalog.all();
    return tools.flatMap((tool) =>
      [tool.name, ...tool.aliases].map((term) => ({ toolId: tool.id, term })),
    );
  }
}

/** The job description's analysis through the job-postings module. */
@Injectable()
export class JobPostingsModuleReader extends JobDescriptionReader {
  constructor(
    private readonly analyses: JobAnalysisService,
    private readonly postings: JobPostingsService,
  ) {
    super();
  }

  async posting(jobPostingId: string): Promise<{ title: string | null; company: string | null }> {
    try {
      const { title, company } = await this.postings.get(jobPostingId);
      return { title, company };
    } catch (error) {
      if (error instanceof JobPostingNotFoundError) {
        throw new TailoringJobPostingNotFoundError(jobPostingId);
      }
      throw error;
    }
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
  if (error instanceof ResumeWithoutNameError) return new PermanentJobError('PROFILE_WITHOUT_NAME');
  // A missing Typst or a broken template does not get better by retrying; a slow render may.
  if (error instanceof ResumeRenderFailedError && error.reason !== 'TIMEOUT') {
    return new PermanentJobError(error.reason);
  }
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
