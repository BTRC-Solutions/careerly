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
