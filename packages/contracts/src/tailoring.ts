import { z } from 'zod';
import { RequirementImportanceSchema, RequirementKindSchema } from './job-postings.js';
import { JobViewSchema } from './jobs.js';
import { ToolRefSchema } from './profile.js';
import { ResumeLanguageSchema } from './resume.js';

/*
 * Tailoring sessions (ARCHITECTURE §7.1): one session adapts the master profile to one job description, from the
 * match to the finalized CVs.
 */

/**
 * - `ANALYZING`: matching the job description against the profile.
 * - `MATCHED`: match ready; the user reviews it before going on.
 * - `AWAITING_ANSWERS`: there are gaps and the user is answering them.
 * - `GENERATING`: writing and fitting the CVs.
 * - `REVIEW`: CVs ready to edit, regenerate or finalize.
 * - `FINALIZED`: snapshots created; the session no longer changes.
 * - `ABANDONED`: the user left it (RF-TAIL-15); kept, but no longer listed as open.
 * - `FAILED`: an AI step failed; it can be retried from that step.
 */
export const TailoringSessionStatusSchema = z.enum([
  'ANALYZING',
  'MATCHED',
  'AWAITING_ANSWERS',
  'GENERATING',
  'REVIEW',
  'FINALIZED',
  'ABANDONED',
  'FAILED',
]);
export type TailoringSessionStatus = z.infer<typeof TailoringSessionStatusSchema>;

/** The steps that can fail, and where a retry goes back to. */
export const TailoringFailedStepSchema = z.enum(['ANALYZING', 'GENERATING']);
export type TailoringFailedStep = z.infer<typeof TailoringFailedStepSchema>;

/** CV page limit (RF-TAIL-08). */
export const PageBudgetSchema = z.union([z.literal(1), z.literal(2)]);
export type PageBudget = z.infer<typeof PageBudgetSchema>;

// ---------------------------------------------------------------------------
// Match (RF-TAIL-02)
// ---------------------------------------------------------------------------

/**
 * - `COVERED`: the profile shows it, with evidence.
 * - `PARTIAL`: there is related evidence, but weaker than asked (e.g. a tool listed without an achievement).
 * - `MISSING`: nothing in the profile shows it.
 */
export const MatchStatusSchema = z.enum(['COVERED', 'PARTIAL', 'MISSING']);
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

/** The profile element a piece of evidence points to. */
export const EvidenceKindSchema = z.enum([
  'ACHIEVEMENT',
  'POSITION',
  'PROJECT',
  'EDUCATION',
  'CERTIFICATION',
  'LANGUAGE',
]);
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

/** A profile element that supports a requirement, by id (never a copy of its text). */
export const EvidenceSchema = z.object({ kind: EvidenceKindSchema, id: z.string() });
export type Evidence = z.infer<typeof EvidenceSchema>;

/**
 * How the status was decided: `TOOLS` compares catalog tools (deterministic, aliases included, RF-GAP-02);
 * `AI` compares the rest with the profile's text.
 */
export const MatchMethodSchema = z.enum(['TOOLS', 'AI']);
export type MatchMethod = z.infer<typeof MatchMethodSchema>;

export const RequirementMatchSchema = z.object({
  requirementId: z.string(),
  label: z.string(),
  kind: RequirementKindSchema,
  importance: RequirementImportanceSchema,
  tool: ToolRefSchema.nullable(),
  status: MatchStatusSchema,
  method: MatchMethodSchema,
  /** Empty when `MISSING`; never empty otherwise. */
  evidence: z.array(EvidenceSchema),
});
export type RequirementMatch = z.infer<typeof RequirementMatchSchema>;

export const MatchResultSchema = z.object({
  /** In the order of the job description's analysis. */
  requirements: z.array(RequirementMatchSchema),
  /** Prompt and model of the AI part; `null` when every requirement was matched by tools. */
  promptVersion: z.string().nullable(),
  model: z.string().nullable(),
  matchedAt: z.iso.datetime(),
});
export type MatchResult = z.infer<typeof MatchResultSchema>;

// ---------------------------------------------------------------------------
// Tailored CVs (RF-TAIL-10, RF-TAIL-11)
// ---------------------------------------------------------------------------

/**
 * Whether a bullet goes into the CV (RF-TAIL-12): `AUTO` lets the page fit decide; `INCLUDED` keeps it whatever
 * the fit says (the CV may then not fit, RN-04); `EXCLUDED` leaves it out.
 */
export const BulletInclusionSchema = z.enum(['AUTO', 'INCLUDED', 'EXCLUDED']);
export type BulletInclusion = z.infer<typeof BulletInclusionSchema>;

/** A CV bullet and the profile elements it comes from (RN-01). */
export const TailoredBulletSchema = z.object({
  id: z.string(),
  text: z.string().trim().min(1),
  /** Achievements (or the project itself) it is based on; never empty for generated bullets. */
  sourceIds: z.array(z.string()).min(1),
  /** Relevance for the job description, 0–1; `null` until relevance scoring exists (roadmap 6.2). */
  score: z.number().min(0).max(1).nullable(),
  /** Edited by the user: RN-01 and RN-02 are no longer checked on it (RN-05). */
  editedByUser: z.boolean(),
  inclusion: BulletInclusionSchema,
});
export type TailoredBullet = z.infer<typeof TailoredBulletSchema>;

/** The bullets written for one position or project, most relevant first (RN-06). */
export const TailoredExperienceSchema = z.object({
  kind: z.enum(['POSITION', 'PROJECT']),
  /** Id of the position or project in the master profile. */
  sourceId: z.string(),
  bullets: z.array(TailoredBulletSchema),
});
export type TailoredExperience = z.infer<typeof TailoredExperienceSchema>;

/**
 * What the AI wrote for one language. Only the worded parts: company, title, dates, education and the rest are
 * copied from the profile when the CV is built (RN-03).
 */
/**
 * Why the truthfulness guard rejected a text (RN-01, RN-02, ARCHITECTURE §7.2 step 9):
 * - `NO_SOURCE`: it cites nothing of its own experience (RN-01).
 * - `UNKNOWN_EXPERIENCE`: it was written for a position or project that is not in the profile.
 * - `TOOL_NOT_IN_SOURCES`: it mentions a tool its sources do not show (RN-02).
 * - `NUMBER_NOT_IN_SOURCES`: it has a number (a metric, an amount) its sources do not have.
 */
export const TruthIssueReasonSchema = z.enum([
  'NO_SOURCE',
  'UNKNOWN_EXPERIENCE',
  'TOOL_NOT_IN_SOURCES',
  'NUMBER_NOT_IN_SOURCES',
]);
export type TruthIssueReason = z.infer<typeof TruthIssueReasonSchema>;

/** A text the guard left out of the CV, kept so the review can show what was dropped and why. */
export const GuardDropSchema = z.object({
  kind: z.enum(['BULLET', 'SUMMARY']),
  /** The position or project it was written for; `null` for the summary. */
  experienceId: z.string().nullable(),
  text: z.string(),
  reasons: z.array(TruthIssueReasonSchema).min(1),
});
export type GuardDrop = z.infer<typeof GuardDropSchema>;

/** What the truthfulness guard did to the AI's answer. */
export const GuardLogSchema = z.object({
  /** Texts that broke a rule and were fixed by rewriting them once. */
  rewritten: z.number().int().nonnegative(),
  dropped: z.array(GuardDropSchema),
});
export type GuardLog = z.infer<typeof GuardLogSchema>;

/** What goes into the CV after the page fit, in display order. Every position is listed, maybe without bullets. */
export const FitSelectionSchema = z.object({
  positions: z.array(z.object({ id: z.string(), bulletIds: z.array(z.string()) })),
  /** Only the projects shown. */
  projects: z.array(z.object({ id: z.string(), bulletIds: z.array(z.string()) })),
});
export type FitSelection = z.infer<typeof FitSelectionSchema>;

/**
 * Why a bullet was left out of the CV or added back (ARCHITECTURE §8): `OLD_POSITION` (shown with no bullets,
 * RN-07), `SECTION_LIMIT` (over the initial bullets of its position), `NOT_RELEVANT` (a project),
 * `OVER_BUDGET` (removed to fit the page limit) and `SPACE_LEFT` (added back to fill the last page).
 */
export const FitReasonSchema = z.enum([
  'OLD_POSITION',
  'SECTION_LIMIT',
  'NOT_RELEVANT',
  'OVER_BUDGET',
  'SPACE_LEFT',
]);
export type FitReason = z.infer<typeof FitReasonSchema>;

export const FitLogEntrySchema = z.object({
  owner: z.object({ type: z.enum(['position', 'project']), id: z.string() }),
  /** `null` when the entry is about a whole project. */
  bulletId: z.string().nullable(),
  action: z.enum(['LEFT_OUT', 'ADDED']),
  reason: FitReasonSchema,
});
export type FitLogEntry = z.infer<typeof FitLogEntrySchema>;

/** The deterministic fit to the page budget (RN-04, ADR-05), measured on the rendered PDF. */
export const ResumeFitSchema = z.object({
  selection: FitSelectionSchema,
  pageCount: z.number().int().positive(),
  /** `false` when even the shortest CV is over the budget: finalizing it needs confirmation (RN-04). */
  fits: z.boolean(),
  pageBudget: PageBudgetSchema,
  log: z.array(FitLogEntrySchema),
});
export type ResumeFit = z.infer<typeof ResumeFitSchema>;

export const TailoredResumeDataSchema = z.object({
  summary: z.object({ text: z.string().trim().min(1), sourceIds: z.array(z.string()) }).nullable(),
  /** Positions and projects with bullets; positions left out are shown with no bullets (RN-07). */
  experiences: z.array(TailoredExperienceSchema),
  /** Profile tools for the skills section, the ones the job description asks for first. */
  toolIds: z.array(z.string()),
  guard: GuardLogSchema,
  /** `null` until the CV is fitted to the page budget. */
  fit: ResumeFitSchema.nullable(),
});
export type TailoredResumeData = z.infer<typeof TailoredResumeDataSchema>;

/** One tailored CV per output language of the session (RF-TAIL-07). Editable until finalized. */
export const TailoredResumeSchema = z.object({
  sessionId: z.string(),
  language: ResumeLanguageSchema,
  data: TailoredResumeDataSchema,
  promptVersion: z.string(),
  model: z.string(),
  generatedAt: z.iso.datetime(),
});
export type TailoredResume = z.infer<typeof TailoredResumeSchema>;

/** `GET /tailoring-sessions/:id/resumes`: the session's CVs, in the order of its languages. */
export const TailoredResumesViewSchema = z.object({ resumes: z.array(TailoredResumeSchema) });
export type TailoredResumesView = z.infer<typeof TailoredResumesViewSchema>;

/**
 * `PATCH /tailoring-sessions/:id/resumes/:language` (RF-TAIL-12): one change to a CV under review; the CV is
 * fitted to its pages again and returned.
 * - `EDIT_BULLET`: new text; the bullet is marked as edited by the user (RN-05).
 * - `EDIT_SUMMARY`: new summary; an empty text removes it.
 * - `MOVE_BULLET`: new place of a bullet inside its position or project (0 is the first).
 * - `SET_INCLUSION`: include it always, leave it out, or let the page fit decide.
 */
export const EditTailoredResumeRequestSchema = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('EDIT_BULLET'),
      bulletId: z.string(),
      text: z.string().trim().min(1).max(1000),
    })
    .strict(),
  z.object({ op: z.literal('EDIT_SUMMARY'), text: z.string().trim().max(2000) }).strict(),
  z
    .object({
      op: z.literal('MOVE_BULLET'),
      bulletId: z.string(),
      toIndex: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      op: z.literal('SET_INCLUSION'),
      bulletId: z.string(),
      inclusion: BulletInclusionSchema,
    })
    .strict(),
]);
export type EditTailoredResumeRequest = z.infer<typeof EditTailoredResumeRequestSchema>;

// ---------------------------------------------------------------------------
// Regeneration (RF-TAIL-13)
// ---------------------------------------------------------------------------

/** What to write again: the whole CV, its summary, or the bullets of one position or project. */
export const RegenerationScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ALL') }).strict(),
  z.object({ kind: z.literal('SUMMARY') }).strict(),
  z.object({ kind: z.literal('EXPERIENCE'), experienceId: z.string().min(1) }).strict(),
]);
export type RegenerationScope = z.infer<typeof RegenerationScopeSchema>;

/** The candidate's own indications for a new version ("more focus on leadership"); they never add facts. */
export const RegenerationInstructionsSchema = z.string().trim().max(500);

/**
 * A regeneration the session is running, kept until it finishes so a retry repeats it. Bullets edited by the
 * user are never discarded, and what is outside the scope is not touched.
 */
export const RegenerationSchema = z.object({
  scope: RegenerationScopeSchema,
  /** `null` without indications. */
  instructions: RegenerationInstructionsSchema.nullable(),
  /** The CVs to write again: some of the session's languages. */
  languages: z.array(ResumeLanguageSchema).min(1),
});
export type Regeneration = z.infer<typeof RegenerationSchema>;

/** `POST /tailoring-sessions/:id/regenerate`: from the review; languages default to all of the session's. */
export const RegenerateResumesRequestSchema = z
  .object({
    scope: RegenerationScopeSchema,
    instructions: RegenerationInstructionsSchema.optional(),
    languages: z
      .array(ResumeLanguageSchema)
      .min(1)
      .refine((languages) => new Set(languages).size === languages.length, {
        message: 'Languages must not repeat.',
      })
      .optional(),
  })
  .strict();
export type RegenerateResumesRequest = z.infer<typeof RegenerateResumesRequestSchema>;

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export const TailoringSessionSchema = z.object({
  id: z.string(),
  jobPostingId: z.string(),
  languages: z.array(ResumeLanguageSchema),
  pageBudget: PageBudgetSchema,
  templateId: z.string(),
  status: TailoringSessionStatusSchema,
  failedStep: TailoringFailedStepSchema.nullable(),
  /** `null` until the first match finishes. */
  match: MatchResultSchema.nullable(),
  /** The regeneration in course (RF-TAIL-13); `null` otherwise. */
  regeneration: RegenerationSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type TailoringSession = z.infer<typeof TailoringSessionSchema>;

/** `GET /tailoring-sessions/:id`: the session and the background job of its current step, if any. */
export const TailoringSessionViewSchema = z.object({
  session: TailoringSessionSchema,
  job: JobViewSchema.nullable(),
});
export type TailoringSessionView = z.infer<typeof TailoringSessionViewSchema>;

/**
 * `POST /tailoring-sessions` (RF-TAIL-01). The job description must be analyzed. Options left out take
 * defaults: the job description's language (or Spanish), 1 page and the `classic` template. Choosing them in
 * the interface comes with step 6.1.
 */
export const CreateTailoringSessionRequestSchema = z
  .object({
    jobPostingId: z.string().min(1),
    languages: z
      .array(ResumeLanguageSchema)
      .min(1)
      .refine((languages) => new Set(languages).size === languages.length, {
        message: 'Languages must not repeat.',
      })
      .optional(),
    pageBudget: PageBudgetSchema.optional(),
    templateId: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type CreateTailoringSessionRequest = z.infer<typeof CreateTailoringSessionRequestSchema>;

// ---------------------------------------------------------------------------
// Open sessions (RF-TAIL-15)
// ---------------------------------------------------------------------------

/** Statuses of a session that is over: finalized or abandoned. Any other one can be resumed. */
export const CLOSED_SESSION_STATUSES: readonly TailoringSessionStatus[] = [
  'FINALIZED',
  'ABANDONED',
];

/** A session in a list: what is needed to find it again, without its match or CVs. */
export const TailoringSessionSummarySchema = z.object({
  id: z.string(),
  jobPostingId: z.string(),
  status: TailoringSessionStatusSchema,
  languages: z.array(ResumeLanguageSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type TailoringSessionSummary = z.infer<typeof TailoringSessionSummarySchema>;

/** `GET /tailoring-sessions?jobPostingId=&open=true`: most recently updated first. */
export const ListTailoringSessionsQuerySchema = z
  .object({
    jobPostingId: z.string().min(1).optional(),
    /** Only sessions that are not finalized or abandoned. */
    open: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();
export type ListTailoringSessionsQuery = z.infer<typeof ListTailoringSessionsQuerySchema>;

export const TailoringSessionListSchema = z.object({
  sessions: z.array(TailoringSessionSummarySchema),
});
export type TailoringSessionList = z.infer<typeof TailoringSessionListSchema>;
