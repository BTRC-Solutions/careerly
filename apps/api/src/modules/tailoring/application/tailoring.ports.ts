import type {
  Evidence,
  GapAnswer,
  ProjectKind,
  GapQuestion,
  JobAnalysis,
  JobRequirement,
  JobView,
  Profile,
  TailoringSession as StoredSession,
  ToolRef,
} from '@careerly/contracts';
import type { SemanticAnswer } from '../domain/match.js';

/** The session does not exist (maps to 404). */
export class TailoringSessionNotFoundError extends Error {
  constructor(readonly sessionId: string) {
    super('Tailoring session not found.');
    this.name = 'TailoringSessionNotFoundError';
  }
}

/** The session has no match yet, so there are no gaps to ask about (maps to 409). */
export class SessionNotMatchedError extends Error {
  constructor(readonly sessionId: string) {
    super('The session has no match yet; wait for it to finish.');
    this.name = 'SessionNotMatchedError';
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

/** The session has no gap question for this requirement (maps to 404). */
export class GapQuestionNotFoundError extends Error {
  constructor(readonly requirementId: string) {
    super('Gap question not found in this session.');
    this.name = 'GapQuestionNotFoundError';
  }
}

/** Port: the gap questions asked in a session and their answers. */
export abstract class GapQuestionRepository {
  /** Replaces the session's questions (with whatever answers they carry), in order. */
  abstract replace(sessionId: string, questions: GapQuestion[]): Promise<void>;
  /** In order; empty until the session asks its gaps. */
  abstract list(sessionId: string): Promise<GapQuestion[]>;
  abstract saveAnswer(
    sessionId: string,
    requirementId: string,
    answer: GapAnswer,
    answeredAt: string,
    created: Evidence[],
  ): Promise<void>;
}

/**
 * Port: writes to the master profile from gap answers (RF-TAIL-05), through the profile module. Everything is
 * created with origin `GAP_ANSWER` and logged under the session, so it can be undone (RF-TAIL-06).
 */
export abstract class ProfileWriter {
  abstract createAchievement(
    sessionId: string,
    parent: { kind: 'position' | 'project'; id: string },
    achievement: { text: string; toolIds: string[] },
  ): Promise<string>;
  abstract createProject(
    sessionId: string,
    project: { name: string; kind: ProjectKind; toolIds: string[] },
  ): Promise<string>;
  /** Undoes what the session created for these elements (e.g. when an answer changes). */
  abstract undo(sessionId: string, created: Evidence[]): Promise<void>;
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
