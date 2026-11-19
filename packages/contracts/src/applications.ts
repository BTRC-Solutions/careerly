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

// ---------------------------------------------------------------------------
// Extra data and contacts (roadmap 7.6, RF-APP-05, RF-APP-07). Never part of telemetry (RN-18).
// ---------------------------------------------------------------------------

/** How the user applied (RF-APP-07). */
export const ApplicationChannelSchema = z.enum(['PORTAL', 'REFERRAL', 'DIRECT_CONTACT', 'OTHER']);
export type ApplicationChannel = z.infer<typeof ApplicationChannelSchema>;

export const ApplicationPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export type ApplicationPriority = z.infer<typeof ApplicationPrioritySchema>;

/** A salary as the user writes it (amount, currency and period vary too much to model): e.g. "USD 4.000/mes". */
const SalaryText = z.string().trim().min(1).max(100);

/** `PATCH /applications/:id`: the extra data; `null` clears a field, a missing one stays as it is. */
export const UpdateApplicationRequestSchema = z
  .object({
    channel: ApplicationChannelSchema.nullable(),
    priority: ApplicationPrioritySchema.nullable(),
    salaryExpected: SalaryText.nullable(),
    salaryOffered: SalaryText.nullable(),
  })
  .partial()
  .strict();
export type UpdateApplicationRequest = z.infer<typeof UpdateApplicationRequestSchema>;

/** The part a contact plays in the process (RF-APP-05). */
export const ContactRoleSchema = z.enum(['RECRUITER', 'HIRING_MANAGER', 'REFERRAL', 'OTHER']);
export type ContactRole = z.infer<typeof ContactRoleSchema>;

/** `POST /applications/:id/contacts` and `PUT /applications/:id/contacts/:contactId`. */
export const ContactInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    role: ContactRoleSchema,
    email: z.email().max(320).nullable().default(null),
    linkedinUrl: z
      .url({ protocol: /^https?$/ })
      .max(500)
      .nullable()
      .default(null),
  })
  .strict();
export type ContactInput = z.input<typeof ContactInputSchema>;

/** A person of the company in an application (RF-APP-05). */
export const ContactSchema = ContactInputSchema.extend({
  id: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strip();
export type Contact = z.infer<typeof ContactSchema>;

/** `GET /applications/:id/contacts`: in the order they were added. */
export const ContactListSchema = z.object({ contacts: z.array(ContactSchema) });
export type ContactList = z.infer<typeof ContactListSchema>;

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
  channel: ApplicationChannelSchema.nullable(),
  priority: ApplicationPrioritySchema.nullable(),
  salaryExpected: z.string().nullable(),
  salaryOffered: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Application = z.infer<typeof ApplicationSchema>;

/** An application in the list, with the job it is for. */
export const ApplicationSummarySchema = ApplicationSchema.pick({
  id: true,
  jobPostingId: true,
  status: true,
  ghostedFrom: true,
  appliedAt: true,
  priority: true,
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

/**
 * `POST /applications/:id/status` (RF-APP-03): moves it to another state. A closed application is reopened to
 * `to` (RN-10); going back needs `confirmBackward` (RN-09); reaching `APPLIED` or later for the first time
 * needs `sent` (the CVs sent, or that it went without one).
 */
export const MoveApplicationRequestSchema = z
  .object({
    to: ApplicationStatusSchema,
    confirmBackward: z.boolean().optional(),
    sent: SendApplicationRequestSchema.optional(),
  })
  .strict();
export type MoveApplicationRequest = z.infer<typeof MoveApplicationRequestSchema>;

// ---------------------------------------------------------------------------
// Timeline (roadmap 7.5, RF-APP-04, RN-09): append-only, nothing in it is edited or deleted
// ---------------------------------------------------------------------------

const TimelineText = z.string().trim().min(1).max(5000);

/** The kind of interview. */
export const InterviewKindSchema = z.enum([
  'SCREENING',
  'TECHNICAL',
  'BEHAVIORAL',
  'CASE',
  'FINAL',
  'OTHER',
]);
export type InterviewKind = z.infer<typeof InterviewKindSchema>;

/** How an interview went, as far as the user knows when recording it. */
export const InterviewOutcomeSchema = z.enum(['PENDING', 'PASSED', 'NOT_PASSED']);
export type InterviewOutcome = z.infer<typeof InterviewOutcomeSchema>;

/** Where a message from the company came in. */
export const MessageChannelSchema = z.enum(['EMAIL', 'LINKEDIN', 'PHONE', 'OTHER']);
export type MessageChannel = z.infer<typeof MessageChannelSchema>;

/** A note of the user. */
export const NoteEntrySchema = z.object({ type: z.literal('NOTE'), text: TimelineText });

/** An interview: its kind, who took it (RF-APP-04) and how it went. */
export const InterviewEntrySchema = z.object({
  type: z.literal('INTERVIEW'),
  kind: InterviewKindSchema,
  interviewers: z.array(z.string().trim().min(1).max(200)).max(10),
  outcome: InterviewOutcomeSchema,
  notes: TimelineText.optional(),
});

/** A message received from the company. */
export const MessageEntrySchema = z.object({
  type: z.literal('MESSAGE'),
  channel: MessageChannelSchema,
  /** Who sent it. */
  from: z.string().trim().min(1).max(200).optional(),
  text: TimelineText,
});

/**
 * A change of state, recorded on its own (RN-09). `from` is `null` when the application was created; `backward`
 * says the user confirmed going back, `reopened` that a closed application was reopened (RN-10).
 */
export const StatusChangeEntrySchema = z.object({
  type: z.literal('STATUS_CHANGE'),
  from: ApplicationStatusSchema.nullable(),
  to: ApplicationStatusSchema,
  backward: z.boolean(),
  reopened: z.boolean(),
});

export const ApplicationEventTypeSchema = z.enum(['STATUS_CHANGE', 'NOTE', 'INTERVIEW', 'MESSAGE']);
export type ApplicationEventType = z.infer<typeof ApplicationEventTypeSchema>;

/** What an event says, by type. */
export const ApplicationEventEntrySchema = z.discriminatedUnion('type', [
  StatusChangeEntrySchema,
  NoteEntrySchema,
  InterviewEntrySchema,
  MessageEntrySchema,
]);
export type ApplicationEventEntry = z.infer<typeof ApplicationEventEntrySchema>;

const EventTimes = {
  id: z.string(),
  /** When it happened (an interview may be ahead); the timeline is ordered by it. */
  occurredAt: z.iso.datetime(),
  /** When it was recorded. */
  createdAt: z.iso.datetime(),
};

/** One event of the timeline. */
export const ApplicationEventSchema = z.discriminatedUnion('type', [
  StatusChangeEntrySchema.extend(EventTimes),
  NoteEntrySchema.extend(EventTimes),
  InterviewEntrySchema.extend(EventTimes),
  MessageEntrySchema.extend(EventTimes),
]);
export type ApplicationEvent = z.infer<typeof ApplicationEventSchema>;

/** `GET /applications/:id/events`: oldest first, by when they happened and then by when they were recorded. */
export const ApplicationEventListSchema = z.object({ events: z.array(ApplicationEventSchema) });
export type ApplicationEventList = z.infer<typeof ApplicationEventListSchema>;

/**
 * `POST /applications/:id/events`: a note, an interview or a message. Changes of state are recorded by the
 * application itself. `occurredAt` is now by default.
 */
const OccurredAt = { occurredAt: z.iso.datetime({ offset: true }).optional() };
export const AddApplicationEventRequestSchema = z.discriminatedUnion('type', [
  NoteEntrySchema.extend(OccurredAt).strict(),
  InterviewEntrySchema.extend(OccurredAt).strict(),
  MessageEntrySchema.extend(OccurredAt).strict(),
]);
export type AddApplicationEventRequest = z.infer<typeof AddApplicationEventRequestSchema>;
