import { z } from 'zod';

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
