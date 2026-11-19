import { z } from 'zod';

/*
 * Job applications (REQUIREMENTS §5.6 and §6.2): the states one goes through after saving a job description.
 *
 *   SAVED ──▶ APPLIED ──▶ SCREENING ──▶ INTERVIEWING ──▶ OFFER ──▶ ACCEPTED
 *                └────────────┴─────────────┴─────────────┴──▶ REJECTED | WITHDRAWN | GHOSTED
 */

/**
 * - `SAVED`: saved, not sent yet.
 * - `APPLIED`: sent, with at least one finalized CV or confirmed as sent without one.
 * - `SCREENING`: first contact or recruiter filter.
 * - `INTERVIEWING`: in interviews.
 * - `OFFER`: offer received.
 * - `ACCEPTED`: offer accepted (terminal).
 * - `REJECTED`: rejected by the company (terminal).
 * - `WITHDRAWN`: the user left the process, or discarded it before applying (terminal).
 * - `GHOSTED`: no answer; it goes back to an active state if the company answers.
 */
export const ApplicationStatusSchema = z.enum([
  'SAVED',
  'APPLIED',
  'SCREENING',
  'INTERVIEWING',
  'OFFER',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'GHOSTED',
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

/** The states along the way, in order: moving to an earlier one is going back (RN-09). */
export const ACTIVE_APPLICATION_STATUSES = [
  'SAVED',
  'APPLIED',
  'SCREENING',
  'INTERVIEWING',
  'OFFER',
] as const satisfies readonly ApplicationStatus[];
export type ActiveApplicationStatus = (typeof ACTIVE_APPLICATION_STATUSES)[number];

/** States that are left only by reopening the application explicitly (RN-10). */
export const TERMINAL_APPLICATION_STATUSES = [
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
] as const satisfies readonly ApplicationStatus[];
export type TerminalApplicationStatus = (typeof TERMINAL_APPLICATION_STATUSES)[number];

/**
 * Why a change of state was refused:
 * - `CLOSED`: the application is in a terminal state; reopen it first (RN-10).
 * - `NOT_CLOSED`: only a terminal application can be reopened.
 * - `SAME_STATUS`: it is already in that state.
 * - `NOT_SENT`: from `SAVED` it can only be sent forward or withdrawn; nothing was sent to reject or ghost.
 * - `NEEDS_CONFIRMATION`: going back to an earlier state needs the user's confirmation (RN-09).
 * - `NEEDS_SENT_CV`: reaching `APPLIED` or later needs a finalized CV, or confirming it went without one.
 * - `INVALID_TARGET`: a reopened application goes to an active state.
 */
export const ApplicationTransitionRefusalSchema = z.enum([
  'CLOSED',
  'NOT_CLOSED',
  'SAME_STATUS',
  'NOT_SENT',
  'NEEDS_CONFIRMATION',
  'NEEDS_SENT_CV',
  'INVALID_TARGET',
]);
export type ApplicationTransitionRefusal = z.infer<typeof ApplicationTransitionRefusalSchema>;
