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
