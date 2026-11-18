import { randomUUID } from 'node:crypto';
import {
  type ListTailoringSessionsQuery,
  type TailoringSessionList,
  type CreateTailoringSessionRequest,
  type JobProgress,
  type JobRequirement,
  type MatchResult,
  type RequirementMatch,
  type ResumeLanguage,
  ResumeLanguageSchema,
  type EditTailoredResumeRequest,
  type FitSelection,
  type Profile,
  type Regeneration,
  type RegenerateResumesRequest,
  type TailoredResume,
  type TailoredResumeData,
  type TailoredResumesView,
  type TailoringSession as StoredSession,
  type TailoringSessionView,
} from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { isToolMatchable, matchTool, semanticMatches } from '../domain/match.js';
import { fitToPages } from '../domain/page-fitter.js';
import { mergeRegenerated, restrictToScope, WHOLE_CV } from '../domain/regeneration.js';
import { applyResumeEdit } from '../domain/resume-edits.js';
import { fitCandidates, orderAsWritten } from '../domain/resume-fit.js';
import { buildResumeDocument, tailoredResumeData } from '../domain/resume-writing.js';
import { applyRewrites, findTruthIssues } from '../domain/truth-guard.js';
import {
  applySessionEvent,
  TailoringSessionValidationError,
  startTailoringSession,
  type TailoringSession,
  type TailoringSessionEvent,
} from '../domain/tailoring-session.js';
import {
  GenerateQueue,
  JobDescriptionReader,
  MatchQueue,
  ProfileReader,
  RequirementMatcher,
  ResumeNotEditableError,
  ResumePdfRenderer,
  ResumeWriter,
  TailoredResumeNotFoundError,
  TailoredResumeRepository,
  TailoringSessionNotFoundError,
  TailoringSessionRepository,
  ToolResolver,
  ToolVocabulary,
} from './tailoring.ports.js';

const DEFAULT_TEMPLATE_ID = 'classic';

/** Paper of tailored CVs until it can be chosen. */
const PAPER = 'a4';

/** Statuses whose background work is the generation, not the match. */
const GENERATION_STATUSES = new Set(['GENERATING', 'REVIEW', 'FINALIZED']);

/**
 * Tailoring sessions (RF-TAIL-01): starting one queues the match (RF-TAIL-02), which runs in the background and
 * moves the session to `MATCHED`. Generating queues the writing of one CV per language (RF-TAIL-10, RF-TAIL-11),
 * which moves it to `REVIEW`. A background step that gives up moves the session to `FAILED`.
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
    private readonly writer: ResumeWriter,
    private readonly resumes: TailoredResumeRepository,
    private readonly generation: GenerateQueue,
    private readonly renderer: ResumePdfRenderer,
    private readonly vocabulary: ToolVocabulary,
  ) {}

  async start(request: CreateTailoringSessionRequest): Promise<TailoringSessionView> {
    const analysis = await this.jobDescriptions.analysis(request.jobPostingId);
    const jdLanguage = ResumeLanguageSchema.safeParse(analysis.language);
    const session = startTailoringSession({
      id: randomUUID(),
      jobPostingId: request.jobPostingId,
      languages: request.languages ?? [jdLanguage.success ? jdLanguage.data : 'es'],
      pageBudget: request.pageBudget ?? 1,
      templateId: request.templateId ?? DEFAULT_TEMPLATE_ID,
    });
    const now = new Date().toISOString();
    const stored: StoredSession = { ...session, createdAt: now, updatedAt: now };
    await this.sessions.save(stored);
    return { session: stored, job: this.queue.request(session.id) };
  }

  /** Sessions to find again (RF-TAIL-15): e.g. the open ones, or those of a job description. */
  async list(query: ListTailoringSessionsQuery): Promise<TailoringSessionList> {
    const sessions = await this.sessions.list(query);
    return {
      sessions: sessions.map(({ id, jobPostingId, status, languages, createdAt, updatedAt }) => ({
        id,
        jobPostingId,
        status,
        languages,
        createdAt,
        updatedAt,
      })),
    };
  }

  /**
   * Leaves the session (RF-TAIL-15). A match or generation still running finishes in the background, but its
   * result is dropped: both jobs only write while the session is still in their step. What the session added
   * to the profile stays; it can be undone first.
   */
  async abandon(id: string): Promise<TailoringSessionView> {
    const session = await this.transition(await this.load(id), { type: 'ABANDON' });
    return { session, job: null };
  }

  async get(id: string): Promise<TailoringSessionView> {
    const session = await this.load(id);
    return { session, job: this.currentJob(session) };
  }

  /** Retries the step that failed. */
  async retry(id: string): Promise<TailoringSessionView> {
    const session = await this.transition(await this.load(id), { type: 'RETRY' });
    const job =
      session.status === 'ANALYZING' ? this.queue.request(id) : this.generation.request(id);
    return { session, job };
  }

  /**
   * Goes to the gap questions (RF-GAP-01): after the match, or back from the review. Answering them comes with
   * roadmap 5.5; for now the session can only go on to generate, skipping them all.
   */
  async askGaps(id: string): Promise<TailoringSessionView> {
    const session = await this.transition(await this.load(id), { type: 'ASK_GAPS' });
    return { session, job: this.currentJob(session) };
  }

  /**
   * Writes the session's CVs in the background: without gaps, after answering them, or again from the review
   * (it replaces the CVs, edits included, until regenerating keeps them in roadmap 6.7).
   */
  async generate(id: string): Promise<TailoringSessionView> {
    const session = await this.transition(await this.load(id), { type: 'GENERATE' });
    return { session, job: this.generation.request(id) };
  }

  /**
   * Writes the CVs again from the review (RF-TAIL-13): the whole CV, its summary or one experience, with the
   * candidate's indications. The user's edits and what is outside the scope are kept.
   */
  async regenerate(id: string, request: RegenerateResumesRequest): Promise<TailoringSessionView> {
    const session = await this.load(id);
    const { scope } = request;
    if (scope.kind === 'EXPERIENCE') {
      const profile = await this.profile.read();
      const known = [...profile.positions, ...profile.projects].some(
        (e) => e.id === scope.experienceId,
      );
      if (!known)
        throw new TailoringSessionValidationError('That experience is not in the profile.');
    }
    const regeneration: Regeneration = {
      scope,
      instructions: request.instructions?.trim() || null,
      languages: request.languages ?? session.languages,
    };
    const next = await this.transition(session, { type: 'GENERATE', regeneration });
    return { session: next, job: this.generation.request(id) };
  }

  /** The session's CVs, in the order of its languages. */
  async listResumes(id: string): Promise<TailoredResumesView> {
    const session = await this.load(id);
    const stored = await this.resumes.list(id);
    const resumes = session.languages.flatMap((language) => {
      const resume = stored.find((r) => r.language === language);
      return resume ? [resume] : [];
    });
    return { resumes };
  }

  /**
   * The CV of a language as a PDF, with the session's template, the bullets its page fit chose and the profile
   * as it is now (companies, dates and the rest are copied from it, RN-03).
   */
  async renderResume(id: string, language: ResumeLanguage): Promise<Uint8Array> {
    const session = await this.load(id);
    const resume = (await this.resumes.list(id)).find((r) => r.language === language);
    if (!resume) throw new TailoredResumeNotFoundError(id, language);
    const document = buildResumeDocument({
      data: resume.data,
      profile: await this.profile.read(),
      language,
      paper: PAPER,
    });
    return (await this.renderer.render(document, session.templateId)).pdf;
  }

  /**
   * One change of the user to a CV under review (RF-TAIL-12, RN-05), fitted to its pages again. A new text
   * first tries the bullets already chosen, with a single render, so the preview updates quickly (RNF-08);
   * when they no longer fit, and after any other change, the whole fit runs again.
   */
  async editResume(
    id: string,
    language: ResumeLanguage,
    edit: EditTailoredResumeRequest,
  ): Promise<TailoredResume> {
    const session = await this.load(id);
    if (session.status !== 'REVIEW') throw new ResumeNotEditableError(id, session.status);
    const resume = (await this.resumes.list(id)).find((r) => r.language === language);
    if (!resume) throw new TailoredResumeNotFoundError(id, language);

    const profile = await this.profile.read();
    const today = new Date().toISOString().slice(0, 7);
    const edited = applyResumeEdit(resume.data, edit);
    let data: TailoredResumeData | null = null;
    const previous = resume.data.fit;
    if ((edit.op === 'EDIT_BULLET' || edit.op === 'EDIT_SUMMARY') && previous?.fits) {
      const pageCount = await this.measure(edited, profile, language, session, previous.selection);
      if (pageCount <= session.pageBudget) data = { ...edited, fit: { ...previous, pageCount } };
    }
    data ??= await this.fit(edited, profile, language, session, today);

    const saved: TailoredResume = { ...resume, data };
    await this.resumes.save(saved);
    return saved;
  }

  /** Fits a CV to the session's page budget, measured on the PDF with its template (RN-04, ADR-05). */
  private async fit(
    data: TailoredResumeData,
    profile: Profile,
    language: ResumeLanguage,
    session: StoredSession,
    today: string,
  ): Promise<TailoredResumeData> {
    const fit = await fitToPages(
      fitCandidates(data, profile),
      (selection) => this.measure(data, profile, language, session, selection),
      { pageBudget: session.pageBudget, today },
    );
    return {
      ...data,
      fit: {
        ...fit,
        selection: orderAsWritten(fit.selection, data),
        pageBudget: session.pageBudget,
      },
    };
  }

  private async measure(
    data: TailoredResumeData,
    profile: Profile,
    language: ResumeLanguage,
    session: StoredSession,
    selection: FitSelection,
  ): Promise<number> {
    const document = buildResumeDocument({ data, profile, language, paper: PAPER, selection });
    return (await this.renderer.render(document, session.templateId)).pageCount;
  }

  /**
   * The generation job's work, per language: the AI writes the CV, the truthfulness guard checks it (RN-01,
   * RN-02), the texts that break a rule go back to the AI once, and what still breaks one is dropped and logged.
   * Then the CV is fitted to the page budget by rendering it (RN-04).
   * Idempotent: a session that is no longer generating is left as it is.
   */
  async runGenerate(
    id: string,
    report: (progress: Partial<JobProgress>) => void = () => {},
  ): Promise<void> {
    const session = await this.load(id);
    if (session.status !== 'GENERATING') return;

    report({ step: 'reading' });
    const [analysis, profile, vocabulary] = await Promise.all([
      this.jobDescriptions.analysis(session.jobPostingId),
      this.profile.read(),
      this.vocabulary.terms(),
    ]);
    const today = new Date().toISOString().slice(0, 7);
    const { scope, instructions, languages } = session.regeneration ?? {
      scope: WHOLE_CV,
      instructions: null,
      languages: session.languages,
    };
    const existing = await this.resumes.list(id);

    const written: TailoredResume[] = [];
    for (const [index, language] of languages.entries()) {
      const progress = { done: index, total: languages.length };
      report({ step: 'writing', ...progress });
      const answer = await this.writer.write({
        profile,
        analysis,
        match: session.match,
        language,
        scope,
        instructions,
      });
      let data = restrictToScope(
        tailoredResumeData(answer.resume, profile, session.match, randomUUID),
        scope,
      );
      const issues = findTruthIssues(data, profile, vocabulary, today);
      if (issues.length > 0) {
        report({ step: 'checking', ...progress });
        const { rewrites } = await this.writer.rewrite({ profile, language, data, issues });
        data = applyRewrites(data, issues, rewrites, profile, vocabulary, today);
      }
      // A CV written before keeps the user's edits and what is outside the scope (RF-TAIL-13).
      const before = existing.find((r) => r.language === language);
      if (before) data = mergeRegenerated(before.data, data, scope);

      report({ step: 'fitting', ...progress });
      data = await this.fit(data, profile, language, session, today);
      written.push({
        sessionId: id,
        language,
        data,
        promptVersion: answer.promptVersion,
        model: answer.model,
        generatedAt: new Date().toISOString(),
      });
    }

    // Read again: the session may have changed while the AI wrote.
    const current = await this.load(id);
    if (current.status !== 'GENERATING') return;
    for (const resume of written) await this.resumes.save(resume);
    await this.transition(current, { type: 'RESUMES_READY' });
  }

  /** After the generation job's last failed attempt: the session can be retried by the user. */
  async markGenerateFailed(id: string): Promise<void> {
    const session = await this.sessions.find(id);
    if (session?.status === 'GENERATING') await this.transition(session, { type: 'FAIL' });
  }

  private currentJob(session: StoredSession) {
    const generating =
      GENERATION_STATUSES.has(session.status) ||
      (session.status === 'FAILED' && session.failedStep === 'GENERATING');
    return generating ? this.generation.current(session.id) : this.queue.current(session.id);
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
