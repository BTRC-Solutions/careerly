import { z } from 'zod';
import { RequirementImportanceSchema, RequirementKindSchema } from './job-postings.js';
import { JobViewSchema } from './jobs.js';
import { ProjectKindSchema, ToolRefSchema } from './profile.js';
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
 * - `FAILED`: an AI step failed; it can be retried from that step.
 */
export const TailoringSessionStatusSchema = z.enum([
  'ANALYZING',
  'MATCHED',
  'AWAITING_ANSWERS',
  'GENERATING',
  'REVIEW',
  'FINALIZED',
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

export const TailoredResumeDataSchema = z.object({
  summary: z.object({ text: z.string().trim().min(1), sourceIds: z.array(z.string()) }).nullable(),
  /** Positions and projects with bullets; positions left out are shown with no bullets (RN-07). */
  experiences: z.array(TailoredExperienceSchema),
  /** Profile tools for the skills section, the ones the job description asks for first. */
  toolIds: z.array(z.string()),
  guard: GuardLogSchema,
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
// Profile changes of a session (RF-TAIL-05, RF-TAIL-06)
// ---------------------------------------------------------------------------

/** The profile elements a gap answer can create or change (same names as the evidence kinds). */
export const ProfileChangeEntitySchema = z.enum(['POSITION', 'PROJECT', 'ACHIEVEMENT']);
export type ProfileChangeEntity = z.infer<typeof ProfileChangeEntitySchema>;

/** One change the session made to the master profile: an element it created, or one it updated. */
export const SessionProfileChangeSchema = z.object({
  id: z.string(),
  entity: ProfileChangeEntitySchema,
  entityId: z.string(),
  kind: z.enum(['CREATE', 'UPDATE']),
  createdAt: z.iso.datetime(),
  /** When it was undone; `null` while it is still in the profile. */
  revertedAt: z.iso.datetime().nullable(),
});
export type SessionProfileChange = z.infer<typeof SessionProfileChangeSchema>;

/** `GET /tailoring-sessions/:id/profile-changes`: oldest first, undone ones included. */
export const SessionProfileChangesSchema = z.object({
  changes: z.array(SessionProfileChangeSchema),
});
export type SessionProfileChanges = z.infer<typeof SessionProfileChangesSchema>;

/** `POST /tailoring-sessions/:id/revert-profile-changes`: only `changeIds`, or every pending change. */
export const RevertProfileChangesRequestSchema = z
  .object({ changeIds: z.array(z.string().min(1)).min(1).max(500).optional() })
  .strict();
export type RevertProfileChangesRequest = z.infer<typeof RevertProfileChangesRequestSchema>;

export const RevertProfileChangesResultSchema = z.object({
  changes: z.array(SessionProfileChangeSchema),
  /** Fields the user edited after the session: undoing kept the user's value. */
  keptFields: z.array(
    z.object({
      entity: ProfileChangeEntitySchema,
      entityId: z.string(),
      fields: z.array(z.string()),
    }),
  ),
});
export type RevertProfileChangesResult = z.infer<typeof RevertProfileChangesResultSchema>;

// ---------------------------------------------------------------------------
// Gap questions (RF-TAIL-04, ARCHITECTURE §7.2 step 5)
// ---------------------------------------------------------------------------

/** `MISSING`: nothing in the profile shows it. `PARTIAL`: there is related, weaker evidence (RF-GAP-03). */
export const GapKindSchema = z.enum(['MISSING', 'PARTIAL']);
export type GapKind = z.infer<typeof GapKindSchema>;

/**
 * One question per partial or missing requirement, built without AI. It carries what the question is about,
 * not its text: the interface words it from templates in its own language.
 */
export const GapQuestionSchema = z.object({
  /** The requirement it asks about; also the question's id within the session. */
  requirementId: z.string(),
  label: z.string(),
  kind: RequirementKindSchema,
  importance: RequirementImportanceSchema,
  /** The catalog tool, for tool requirements that resolved to one (the question uses its name). */
  tool: ToolRefSchema.nullable(),
  gap: GapKindSchema,
  /** What the profile already shows that is related; empty when `MISSING`. */
  relatedEvidence: z.array(EvidenceSchema),
  /** `null` until answered; an unanswered question counts as skipped (RF-GAP-01). */
  answer: z.lazy(() => GapAnswerSchema).nullable(),
  answeredAt: z.iso.datetime().nullable(),
  /**
   * What the answer added to the master profile (RF-TAIL-05): the achievements and the new project, with origin
   * `GAP_ANSWER`. Empty for "no" and skipped answers, which never touch the profile (RN-11).
   */
  created: z.array(EvidenceSchema),
});
export type GapQuestion = z.infer<typeof GapQuestionSchema>;

/** `GET /tailoring-sessions/:id/gaps`: required requirements first, then in the job description's order. */
export const GapQuestionsSchema = z.object({ questions: z.array(GapQuestionSchema) });
export type GapQuestions = z.infer<typeof GapQuestionsSchema>;

/**
 * The answer to a gap question (RF-GAP-01, REQUIREMENTS §5.5). `PUT /tailoring-sessions/:id/gaps/:requirementId`.
 * - `USED_AT_WORK`: in one or more positions of the profile, with 1–2 lines of what the user did.
 * - `USED_ELSEWHERE`: in a project, course or certification, existing or new, and whether this CV shows it.
 * - `NOT_USED`: "no". It lives only in the session, never in the profile (RN-11, RN-12).
 * - `SKIPPED`: treated as "no" for this CV.
 */
const GapDetailSchema = z.string().trim().min(1).max(1000);

export const GapAnswerSchema = z.discriminatedUnion('answer', [
  z
    .object({
      answer: z.literal('USED_AT_WORK'),
      positionIds: z.array(z.string().min(1)).min(1).max(10),
      detail: GapDetailSchema,
    })
    .strict(),
  z
    .object({
      answer: z.literal('USED_ELSEWHERE'),
      /** An existing project, or a new one to create. */
      project: z.union([
        z.object({ id: z.string().min(1) }).strict(),
        z.object({ name: z.string().trim().min(1).max(160), kind: ProjectKindSchema }).strict(),
      ]),
      detail: GapDetailSchema,
      /** "Is it relevant for THIS CV?" */
      includeInResume: z.boolean(),
    })
    .strict(),
  z.object({ answer: z.literal('NOT_USED') }).strict(),
  z.object({ answer: z.literal('SKIPPED') }).strict(),
]);
export type GapAnswer = z.infer<typeof GapAnswerSchema>;
export type GapAnswerKind = GapAnswer['answer'];
