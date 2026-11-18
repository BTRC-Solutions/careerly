import type {
  JobAnalysis,
  JobRequirement,
  JobView,
  MatchResult,
  Profile,
  ResumeDocument,
  ResumeLanguage,
  TailoredResume,
  TailoredResumeData,
  TailoringSession as StoredSession,
  ToolRef,
} from '@careerly/contracts';
import type { SemanticAnswer } from '../domain/match.js';
import type { WrittenResume } from '../domain/resume-writing.js';
import type { ToolTerm, TruthIssue, TruthRewrite } from '../domain/truth-guard.js';

/** The session does not exist (maps to 404). */
export class TailoringSessionNotFoundError extends Error {
  constructor(readonly sessionId: string) {
    super('Tailoring session not found.');
    this.name = 'TailoringSessionNotFoundError';
  }
}

/** The job description does not exist (maps to 404). */
export class TailoringJobPostingNotFoundError extends Error {
  constructor(readonly jobPostingId: string) {
    super('Job posting not found.');
    this.name = 'TailoringJobPostingNotFoundError';
  }
}

/** The job description has no analysis to match against, or it is running (maps to 409). */
export class JobDescriptionNotReadyError extends Error {
  constructor(
    readonly jobPostingId: string,
    readonly reason: 'NOT_ANALYZED' | 'ANALYZING',
  ) {
    super(
      reason === 'ANALYZING'
        ? 'The job description is being analyzed; try again when it finishes.'
        : 'Analyze the job description before tailoring a CV for it.',
    );
    this.name = 'JobDescriptionNotReadyError';
  }
}

/** Port: the master profile, read through the profile module's public service. */
export abstract class ProfileReader {
  abstract read(): Promise<Profile>;
}

/** Port: a job description's analysis, through the job-postings module. */
export abstract class JobDescriptionReader {
  /**
   * The current analysis; throws `TailoringJobPostingNotFoundError` if the posting does not exist and
   * `JobDescriptionNotReadyError` if it has no analysis or one is running.
   */
  abstract analysis(jobPostingId: string): Promise<JobAnalysis>;
}

/** Port: resolves a tool name to the catalog, aliases included (RF-GAP-02). */
export abstract class ToolResolver {
  abstract resolve(name: string): Promise<ToolRef | null>;
}

/** Port: the AI match of requirements the catalog cannot decide (ARCHITECTURE §7.2, step 4). */
export abstract class RequirementMatcher {
  abstract match(
    requirements: JobRequirement[],
    profile: Profile,
  ): Promise<{ answers: SemanticAnswer[]; promptVersion: string; model: string }>;
}

/** What the CV writer gets for one language. */
export interface ResumeWritingInput {
  profile: Profile;
  analysis: JobAnalysis;
  match: MatchResult | null;
  language: ResumeLanguage;
}

/** What the CV writer gets to fix the texts the truthfulness guard rejected. */
export interface ResumeRewritingInput {
  profile: Profile;
  language: ResumeLanguage;
  /** The CV as written, for the sources of each text. */
  data: TailoredResumeData;
  issues: TruthIssue[];
}

/** Port: the AI that words bullets and summary for one language (ARCHITECTURE §7.2, steps 8 and 9). */
export abstract class ResumeWriter {
  abstract write(
    input: ResumeWritingInput,
  ): Promise<{ resume: WrittenResume; promptVersion: string; model: string }>;

  /** Rewrites, once, the texts that broke a rule; one that cannot be fixed comes back empty. */
  abstract rewrite(input: ResumeRewritingInput): Promise<{ rewrites: TruthRewrite[] }>;
}

/** Port: every name and alias of the tool catalog, to find tools mentioned in a text (RN-02). */
export abstract class ToolVocabulary {
  abstract terms(): Promise<ToolTerm[]>;
}

/** Port: the session's tailored CVs, one per language. */
export abstract class TailoredResumeRepository {
  /** Inserts or replaces the CV of its session and language. */
  abstract save(resume: TailoredResume): Promise<void>;
  abstract list(sessionId: string): Promise<TailoredResume[]>;
}

/** CVs can be changed only while the session is under review (maps to 409). */
export class ResumeNotEditableError extends Error {
  constructor(
    readonly sessionId: string,
    readonly status: string,
  ) {
    super(`The CVs of a ${status} session cannot be edited; only those under review can.`);
    this.name = 'ResumeNotEditableError';
  }
}

/** The session has no CV in that language yet (maps to 404). */
export class TailoredResumeNotFoundError extends Error {
  constructor(
    readonly sessionId: string,
    readonly language: ResumeLanguage,
  ) {
    super('This session has no CV in that language yet.');
    this.name = 'TailoredResumeNotFoundError';
  }
}

/**
 * The CV could not be rendered: its template no longer exists (`TEMPLATE_NOT_FOUND`, maps to 404), Typst is
 * missing (`RENDERER_UNAVAILABLE`, 503) or the template fails (`COMPILE_ERROR`, `TIMEOUT`, 422). The
 * diagnostics are for the template's author, who is the user: they are shown, never logged.
 */
export class ResumeRenderFailedError extends Error {
  constructor(
    readonly reason: 'TEMPLATE_NOT_FOUND' | 'RENDERER_UNAVAILABLE' | 'COMPILE_ERROR' | 'TIMEOUT',
    message: string,
    readonly diagnostics: string | null = null,
  ) {
    super(message);
    this.name = 'ResumeRenderFailedError';
  }
}

/** Port: renders a CV with a template, through the documents module; throws `ResumeRenderFailedError`. */
export abstract class ResumePdfRenderer {
  abstract render(
    document: ResumeDocument,
    templateId: string,
  ): Promise<{ pdf: Uint8Array; pageCount: number }>;
}

/** Port: stored sessions. */
export abstract class TailoringSessionRepository {
  abstract save(session: StoredSession): Promise<void>;
  abstract find(id: string): Promise<StoredSession | null>;
}

/** Port: the background job that matches a session (one per session; retrying restarts it). */
export abstract class MatchQueue {
  /** Max attempts of a match job; the last failure marks the session `FAILED`. */
  static readonly MAX_ATTEMPTS = 3;
  abstract request(sessionId: string): JobView;
  abstract current(sessionId: string): JobView | null;
}

/** Port: the background job that writes a session's CVs (one per session; regenerating restarts it). */
export abstract class GenerateQueue {
  /** Max attempts of a generation job; the last failure marks the session `FAILED`. */
  static readonly MAX_ATTEMPTS = 3;
  abstract request(sessionId: string): JobView;
  abstract current(sessionId: string): JobView | null;
}
