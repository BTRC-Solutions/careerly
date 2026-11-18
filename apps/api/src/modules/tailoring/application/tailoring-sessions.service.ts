import { randomUUID } from 'node:crypto';
import {
  type CreateTailoringSessionRequest,
  type JobProgress,
  type JobRequirement,
  type MatchResult,
  type RequirementMatch,
  ResumeLanguageSchema,
  type TailoringSession as StoredSession,
  type TailoringSessionView,
  type UpdateTailoringOptionsRequest,
} from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { isToolMatchable, matchTool, semanticMatches } from '../domain/match.js';
import { defaultPageBudget } from '../domain/session-options.js';
import {
  applySessionEvent,
  changeSessionOptions,
  startTailoringSession,
  type TailoringSession,
  type TailoringSessionEvent,
} from '../domain/tailoring-session.js';
import {
  JobDescriptionReader,
  MatchQueue,
  ProfileReader,
  RequirementMatcher,
  TailoringSessionNotFoundError,
  TailoringSessionRepository,
  TailoringTemplateNotFoundError,
  TemplateLookup,
  ToolResolver,
} from './tailoring.ports.js';

const DEFAULT_TEMPLATE_ID = 'classic';

/**
 * Tailoring sessions (RF-TAIL-01) up to the match (RF-TAIL-02): starting one queues the match, which runs in
 * the background and moves the session to `MATCHED`, or to `FAILED` after its last attempt. The CV options
 * (RF-TAIL-07 to RF-TAIL-09) are set when starting and can change until the session is finalized.
 */
@Injectable()
export class TailoringSessionsService {
  constructor(
    private readonly sessions: TailoringSessionRepository,
    private readonly jobDescriptions: JobDescriptionReader,
    private readonly profile: ProfileReader,
    private readonly tools: ToolResolver,
    private readonly matcher: RequirementMatcher,
    private readonly queue: MatchQueue,
    private readonly templates: TemplateLookup,
  ) {}

  async start(request: CreateTailoringSessionRequest): Promise<TailoringSessionView> {
    const analysis = await this.jobDescriptions.analysis(request.jobPostingId);
    const jdLanguage = ResumeLanguageSchema.safeParse(analysis.language);
    const templateId = request.templateId ?? DEFAULT_TEMPLATE_ID;
    await this.checkTemplate(templateId);
    const session = startTailoringSession({
      id: randomUUID(),
      jobPostingId: request.jobPostingId,
      languages: request.languages ?? [jdLanguage.success ? jdLanguage.data : 'es'],
      pageBudget:
        request.pageBudget ?? defaultPageBudget((await this.profile.read()).positions, thisMonth()),
      templateId,
    });
    const now = new Date().toISOString();
    const stored: StoredSession = { ...session, createdAt: now, updatedAt: now };
    await this.sessions.save(stored);
    return { session: stored, job: this.queue.request(session.id) };
  }

  async get(id: string): Promise<TailoringSessionView> {
    const session = await this.load(id);
    return { session, job: this.queue.current(id) };
  }

  /** Changes the CV options; they apply to the next generation. */
  async updateOptions(
    id: string,
    changes: UpdateTailoringOptionsRequest,
  ): Promise<TailoringSessionView> {
    if (changes.templateId !== undefined) await this.checkTemplate(changes.templateId);
    const { createdAt, updatedAt: _updatedAt, ...session } = await this.load(id);
    const saved: StoredSession = {
      ...changeSessionOptions(session, changes),
      createdAt,
      updatedAt: new Date().toISOString(),
    };
    await this.sessions.save(saved);
    return { session: saved, job: this.queue.current(id) };
  }

  /** Retries the step that failed (only the match exists so far). */
  async retry(id: string): Promise<TailoringSessionView> {
    const session = await this.transition(await this.load(id), { type: 'RETRY' });
    const job = session.status === 'ANALYZING' ? this.queue.request(id) : this.queue.current(id);
    return { session, job };
  }

  /**
   * The match job's work. Idempotent: a session that is no longer matching is left as it is. Throws
   * `TailoringSessionNotFoundError`, or the job description's errors if it was deleted meanwhile.
   */
  async runMatch(
    id: string,
    report: (progress: Partial<JobProgress>) => void = () => {},
  ): Promise<void> {
    const session = await this.load(id);
    if (session.status !== 'ANALYZING') return;

    report({ step: 'reading' });
    const [analysis, profile] = await Promise.all([
      this.jobDescriptions.analysis(session.jobPostingId),
      this.profile.read(),
    ]);

    // The catalog may know tools it did not when the job description was analyzed.
    const requirements = await Promise.all(analysis.requirements.map((r) => this.resolveTool(r)));
    const byTools = requirements.filter(isToolMatchable).map((r) => matchTool(r, profile));
    const forAi = requirements.filter((r) => !isToolMatchable(r));

    let ai: { matches: RequirementMatch[]; promptVersion: string; model: string } | null = null;
    if (forAi.length > 0) {
      report({ step: 'matching', done: byTools.length, total: requirements.length });
      const answer = await this.matcher.match(forAi, profile);
      ai = { ...answer, matches: semanticMatches(forAi, answer.answers, profile) };
    }

    const byId = new Map([...byTools, ...(ai?.matches ?? [])].map((m) => [m.requirementId, m]));
    const match: MatchResult = {
      requirements: requirements.map((r) => byId.get(r.id)!),
      promptVersion: ai?.promptVersion ?? null,
      model: ai?.model ?? null,
      matchedAt: new Date().toISOString(),
    };
    // Read again: the session may have changed while the AI answered.
    const current = await this.load(id);
    if (current.status === 'ANALYZING') {
      await this.transition(current, { type: 'MATCH_READY', match });
    }
  }

  /** After the match job's last failed attempt: the session can be retried by the user. */
  async markMatchFailed(id: string): Promise<void> {
    const session = await this.sessions.find(id);
    if (session?.status === 'ANALYZING') await this.transition(session, { type: 'FAIL' });
  }

  private async resolveTool(requirement: JobRequirement): Promise<JobRequirement> {
    if (requirement.kind !== 'TOOL' || requirement.tool !== null) return requirement;
    return { ...requirement, tool: await this.tools.resolve(requirement.label) };
  }

  private async checkTemplate(templateId: string) {
    if (!(await this.templates.exists(templateId))) {
      throw new TailoringTemplateNotFoundError(templateId);
    }
  }

  private async load(id: string): Promise<StoredSession> {
    const session = await this.sessions.find(id);
    if (!session) throw new TailoringSessionNotFoundError(id);
    return session;
  }

  private async transition(
    stored: StoredSession,
    event: TailoringSessionEvent,
  ): Promise<StoredSession> {
    const { createdAt, updatedAt: _updatedAt, ...session } = stored;
    const next: TailoringSession = applySessionEvent(session, event);
    const saved: StoredSession = { ...next, createdAt, updatedAt: new Date().toISOString() };
    await this.sessions.save(saved);
    return saved;
  }
}

/** The current month, "YYYY-MM" (UTC). */
function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
