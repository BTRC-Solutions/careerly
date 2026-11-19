import { z } from 'zod';
import { ResumeLanguageSchema } from './resume.js';

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

// ---------------------------------------------------------------------------
// Applications and the CVs sent with them (roadmap 7.3, RF-APP-01, RF-APP-02, RF-APP-08)
// ---------------------------------------------------------------------------

/** A finalized CV sent with an application; its PDF is at `GET /resume-versions/:id/pdf`. */
export const SentResumeSchema = z.object({
  resumeVersionId: z.string(),
  /** The tailoring session that finalized it. */
  sessionId: z.string(),
  language: ResumeLanguageSchema,
  fileName: z.string(),
  /** The day it was sent (YYYY-MM-DD). */
  sentAt: z.iso.date(),
});
export type SentResume = z.infer<typeof SentResumeSchema>;

/** One application per job description (RF-APP-01). */
export const ApplicationSchema = z.object({
  id: z.string(),
  jobPostingId: z.string(),
  status: ApplicationStatusSchema,
  /** While `GHOSTED`: the state it was in. */
  ghostedFrom: z.enum(ACTIVE_APPLICATION_STATUSES).nullable(),
  /** The day it was sent (YYYY-MM-DD); `null` until then. */
  appliedAt: z.iso.date().nullable(),
  /** Sent without a CV made with Careerly. */
  sentWithoutCareerlyCv: z.boolean(),
  /** Oldest first. */
  sentResumes: z.array(SentResumeSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Application = z.infer<typeof ApplicationSchema>;

/** An application in the list, with the job it is for. */
export const ApplicationSummarySchema = ApplicationSchema.pick({
  id: true,
  jobPostingId: true,
  status: true,
  appliedAt: true,
  createdAt: true,
  updatedAt: true,
}).extend({ title: z.string().nullable(), company: z.string().nullable() });
export type ApplicationSummary = z.infer<typeof ApplicationSummarySchema>;

/** `GET /applications`: most recently updated first. */
export const ApplicationListSchema = z.object({ applications: z.array(ApplicationSummarySchema) });
export type ApplicationList = z.infer<typeof ApplicationListSchema>;

/** `GET /applications?jobPostingId=`: the application of one job description, if any. */
export const ListApplicationsQuerySchema = z.object({ jobPostingId: z.string().min(1).optional() });
export type ListApplicationsQuery = z.infer<typeof ListApplicationsQuerySchema>;

/**
 * The application was sent (RF-APP-02): with some finalized CVs of its job description, or without a CV made
 * with Careerly. A saved application becomes `APPLIED`; one already sent only gets the new CVs.
 */
export const SendApplicationRequestSchema = z
  .object({
    resumeVersionIds: z.array(z.string().min(1)).max(10),
    sentWithoutCareerlyCv: z.boolean().optional(),
    /** The day it was sent (YYYY-MM-DD); today by default. */
    sentAt: z.iso.date().optional(),
  })
  .strict()
  .refine((sent) => sent.resumeVersionIds.length > 0 || sent.sentWithoutCareerlyCv === true, {
    message: 'Pick the CVs that were sent, or confirm it went without a CV made with Careerly.',
  });
export type SendApplicationRequest = z.infer<typeof SendApplicationRequestSchema>;

/** `POST /applications` (RF-APP-01): saved, or already sent when `sent` is given. */
export const CreateApplicationRequestSchema = z
  .object({ jobPostingId: z.string().min(1), sent: SendApplicationRequestSchema.optional() })
  .strict();
export type CreateApplicationRequest = z.infer<typeof CreateApplicationRequestSchema>;
