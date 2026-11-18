import type {
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

/** The chosen template does not exist (maps to 400). */
export class TailoringTemplateNotFoundError extends Error {
  constructor(readonly templateId: string) {
    super(`Template not found: ${templateId}.`);
    this.name = 'TailoringTemplateNotFoundError';
  }
}

/** Port: the CV templates, through the documents module (RF-TAIL-09). */
export abstract class TemplateLookup {
  abstract exists(templateId: string): Promise<boolean>;
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
