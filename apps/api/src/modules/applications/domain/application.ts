/*
 * Job application aggregate (REQUIREMENTS §6.2, ARCHITECTURE §6): the state machine of one application. Pure:
 * callers persist the returned application and record the returned status change in its timeline (RN-09,
 * roadmap 7.5).
 *
 *   SAVED ──▶ APPLIED ──▶ SCREENING ──▶ INTERVIEWING ──▶ OFFER ──▶ ACCEPTED
 *                └────────────┴─────────────┴─────────────┴──▶ REJECTED | WITHDRAWN | GHOSTED
 *
 * Rules (RN-08 to RN-10, and what the diagram leaves open, decided in roadmap 7.2):
 * - Forward moves may skip states (RN-08); moving to an earlier state needs `confirmBackward` (RN-09).
 * - ACCEPTED, REJECTED and WITHDRAWN are terminal: only an explicit REOPEN leaves them (RN-10), to the active
 *   state the user picks.
 * - GHOSTED is not terminal: it remembers the state it came from. Going back to that state or a later one is
 *   free; to an earlier one is going back. From GHOSTED it can also be closed.
 * - From SAVED nothing was sent, so it can only move forward or be WITHDRAWN (discarded), not be REJECTED or
 *   GHOSTED.
 * - Reaching APPLIED or later for the first time (by any jump, or reopening) needs a finalized CV sent with it
 *   or the confirmation that it went without one; `appliedAt` is set then (a date the user gives, or now) and
 *   kept even if the application goes back to SAVED.
 */

import {
  ACTIVE_APPLICATION_STATUSES,
  type ActiveApplicationStatus,
  type ApplicationStatus,
  type ApplicationTransitionRefusal,
  TERMINAL_APPLICATION_STATUSES,
} from '@careerly/contracts';

export interface Application {
  id: string;
  jobPostingId: string;
  status: ApplicationStatus;
  /** While `GHOSTED`: the state it was in; `null` otherwise. */
  ghostedFrom: ActiveApplicationStatus | null;
  /** When it was sent: set the first time it reaches `APPLIED` or later; `null` before. */
  appliedAt: string | null;
  /** Finalized CVs sent with it (RF-APP-02, roadmap 7.3). */
  sentResumeCount: number;
  /** The user confirmed it was sent without a CV made with Careerly. */
  sentWithoutCareerlyCv: boolean;
}

/** What can be confirmed when the application is sent (reaches `APPLIED` or later). */
interface Sending {
  /** It was sent without a CV made with Careerly. */
  sentWithoutCareerlyCv?: boolean;
  /** When it was sent, if not now (ISO 8601). */
  appliedAt?: string;
}

export type ApplicationEvent =
  /** The user moves it to another state (kanban, RF-APP-03). `at` is now (ISO 8601). */
  | ({
      type: 'MOVE';
      to: ApplicationStatus;
      at: string;
      /** Going back to an earlier state was confirmed (RN-09). */
      confirmBackward?: boolean;
    } & Sending)
  /** Reopens a closed application in the active state the user picks (RN-10). */
  | ({ type: 'REOPEN'; to: ActiveApplicationStatus; at: string } & Sending);

/** A change of state for the timeline (RN-09, RF-APP-04). */
export interface StatusChange {
  from: ApplicationStatus;
  to: ApplicationStatus;
  /** It went to an earlier state, after the user confirmed it. */
  backward: boolean;
  /** It left a terminal state by reopening (RN-10). */
  reopened: boolean;
  at: string;
}

/** The change is not allowed (maps to 409 with the reason, so the UI can ask for what is missing). */
export class InvalidApplicationTransitionError extends Error {
  constructor(
    readonly from: ApplicationStatus,
    readonly to: ApplicationStatus,
    readonly reason: ApplicationTransitionRefusal,
  ) {
    super(`Cannot move a ${from} application to ${to}: ${reason}.`);
    this.name = 'InvalidApplicationTransitionError';
  }
}

/** A new application starts saved, not sent yet (RF-APP-01). */
export function newApplication(input: { id: string; jobPostingId: string }): Application {
  return {
    ...input,
    status: 'SAVED',
    ghostedFrom: null,
    appliedAt: null,
    sentResumeCount: 0,
    sentWithoutCareerlyCv: false,
  };
}

export function isTerminal(status: ApplicationStatus): boolean {
  return (TERMINAL_APPLICATION_STATUSES as readonly ApplicationStatus[]).includes(status);
}

export function isActive(status: ApplicationStatus): status is ActiveApplicationStatus {
  return (ACTIVE_APPLICATION_STATUSES as readonly ApplicationStatus[]).includes(status);
}

/** Position along the way; `ACCEPTED` comes after `OFFER`. Other states have none. */
function rank(status: ApplicationStatus): number | null {
  if (status === 'ACCEPTED') return ACTIVE_APPLICATION_STATUSES.length;
  return isActive(status) ? ACTIVE_APPLICATION_STATUSES.indexOf(status) : null;
}

const APPLIED_RANK = ACTIVE_APPLICATION_STATUSES.indexOf('APPLIED');

/**
 * Applies an event and returns the new application with the change for the timeline. Throws
 * `InvalidApplicationTransitionError` when it is not allowed.
 */
export function applyApplicationEvent(
  application: Application,
  event: ApplicationEvent,
): { application: Application; change: StatusChange } {
  const from = application.status;
  const { to } = event;
  const refuse = (reason: ApplicationTransitionRefusal): never => {
    throw new InvalidApplicationTransitionError(from, to, reason);
  };

  if (event.type === 'REOPEN') {
    if (!isTerminal(from)) refuse('NOT_CLOSED');
    if (!isActive(to)) refuse('INVALID_TARGET');
  } else {
    if (isTerminal(from)) refuse('CLOSED');
    if (to === from) refuse('SAME_STATUS');
    if (from === 'SAVED' && (to === 'REJECTED' || to === 'GHOSTED')) refuse('NOT_SENT');
  }

  // Where it stands along the way: a ghosted application stands where it was left.
  const current =
    event.type === 'MOVE' ? rank(from === 'GHOSTED' ? application.ghostedFrom! : from) : null;
  const target = rank(to);
  const backward = current !== null && target !== null && target < current;
  if (backward && !(event.type === 'MOVE' && event.confirmBackward)) refuse('NEEDS_CONFIRMATION');

  let { appliedAt, sentWithoutCareerlyCv } = application;
  if (appliedAt === null && target !== null && target >= APPLIED_RANK) {
    sentWithoutCareerlyCv ||= event.sentWithoutCareerlyCv === true;
    if (application.sentResumeCount === 0 && !sentWithoutCareerlyCv) refuse('NEEDS_SENT_CV');
    appliedAt = event.appliedAt ?? event.at;
  }

  return {
    application: {
      ...application,
      status: to,
      ghostedFrom: to === 'GHOSTED' ? (from as ActiveApplicationStatus) : null,
      appliedAt,
      sentWithoutCareerlyCv,
    },
    change: { from, to, backward, reopened: event.type === 'REOPEN', at: event.at },
  };
}
