/*
 * Tailoring session aggregate (ARCHITECTURE.md §6 and §7.1): the state machine of one CV adaptation, from the
 * match to the finalized snapshots. Pure: callers persist the returned session and run the side effects
 * (AI calls, profile writes, renders) that each transition stands for.
 *
 *   ANALYZING ──MATCH_READY──▶ MATCHED ──ASK_GAPS (gaps)──▶ AWAITING_ANSWERS ──GENERATE──▶ GENERATING
 *                                 └──────GENERATE (no gaps)──────────────────────────────▶ GENERATING
 *   GENERATING ──RESUMES_READY──▶ REVIEW ──FINALIZE──▶ FINALIZED
 *   REVIEW ──GENERATE──▶ GENERATING (regenerate)     REVIEW ──ASK_GAPS (gaps)──▶ AWAITING_ANSWERS
 *   ANALYZING | GENERATING ──FAIL──▶ FAILED ──RETRY──▶ the step that failed
 *
 * Rules the diagram leaves open, decided here:
 * - The match decides whether there are gaps (`countGaps`); with gaps the session must go through the questions, without them
 *   there is nothing to ask (also from REVIEW). Skipping questions happens inside AWAITING_ANSWERS (RF-GAP-01).
 * - FAILED remembers the step that failed, so a retry goes back to that step and not to the other one.
 * - FINALIZED is terminal: what was sent does not change (RNF-10).
 */

import type {
  MatchResult,
  PageBudget,
  ResumeLanguage,
  TailoringFailedStep,
  TailoringSessionStatus,
} from '@careerly/contracts';
import { countGaps } from './match.js';

export interface TailoringSession {
  id: string;
  jobPostingId: string;
  /** Output languages, one CV each (RF-TAIL-07). Not empty, no duplicates. */
  languages: ResumeLanguage[];
  pageBudget: PageBudget;
  templateId: string;
  status: TailoringSessionStatus;
  /** The last match (RF-TAIL-02); `null` until there is one. */
  match: MatchResult | null;
  /** Set only while `FAILED`. */
  failedStep: TailoringFailedStep | null;
}

export type TailoringSessionEvent =
  /** The match finished (RF-TAIL-02). */
  | { type: 'MATCH_READY'; match: MatchResult }
  /** Go to the gap questions: after the match, or back from the review. */
  | { type: 'ASK_GAPS' }
  /** Generate the CVs: without gaps, after answering them, or again from the review. */
  | { type: 'GENERATE' }
  /** CVs written and fitted to the page budget. */
  | { type: 'RESUMES_READY' }
  /** Snapshots created (RF-TAIL-14). */
  | { type: 'FINALIZE' }
  /** The running AI step failed. */
  | { type: 'FAIL' }
  /** Try the failed step again. */
  | { type: 'RETRY' };

export type TailoringSessionEventType = TailoringSessionEvent['type'];

export const TAILORING_SESSION_EVENT_TYPES: readonly TailoringSessionEventType[] = [
  'MATCH_READY',
  'ASK_GAPS',
  'GENERATE',
  'RESUMES_READY',
  'FINALIZE',
  'FAIL',
  'RETRY',
];

/** The session options break a rule (maps to 400 VALIDATION_FAILED). */
export class TailoringSessionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TailoringSessionValidationError';
  }
}

/** The event is not allowed in the current status (maps to 409 CONFLICT). */
export class InvalidSessionTransitionError extends Error {
  constructor(
    readonly from: TailoringSessionStatus,
    readonly event: TailoringSessionEventType,
    reason?: string,
  ) {
    super(`Cannot apply ${event} to a ${from} session${reason ? `: ${reason}` : ''}.`);
    this.name = 'InvalidSessionTransitionError';
  }
}

export interface NewTailoringSession {
  id: string;
  jobPostingId: string;
  languages: ResumeLanguage[];
  pageBudget: PageBudget;
  templateId: string;
}

/** Starts a session (RF-TAIL-01): it begins matching right away. */
export function startTailoringSession(input: NewTailoringSession): TailoringSession {
  if (input.languages.length === 0) {
    throw new TailoringSessionValidationError('At least one output language is required.');
  }
  if (new Set(input.languages).size !== input.languages.length) {
    throw new TailoringSessionValidationError('Output languages must not repeat.');
  }
  if (input.templateId.trim() === '') {
    throw new TailoringSessionValidationError('A template is required.');
  }
  return {
    ...input,
    languages: [...input.languages],
    status: 'ANALYZING',
    match: null,
    failedStep: null,
  };
}

/** Applies an event and returns the new session; throws `InvalidSessionTransitionError` if not allowed. */
export function applySessionEvent(
  session: TailoringSession,
  event: TailoringSessionEvent,
): TailoringSession {
  const { status } = session;
  const reject = (reason?: string): never => {
    throw new InvalidSessionTransitionError(status, event.type, reason);
  };
  const to = (next: TailoringSessionStatus, changes: Partial<TailoringSession> = {}) => ({
    ...session,
    ...changes,
    status: next,
    failedStep: null,
  });
  const hasGaps = session.match !== null && countGaps(session.match) > 0;

  switch (event.type) {
    case 'MATCH_READY':
      if (status !== 'ANALYZING') return reject();
      return to('MATCHED', { match: event.match });

    case 'ASK_GAPS':
      if (status !== 'MATCHED' && status !== 'REVIEW') return reject();
      if (!hasGaps) return reject('the match has no gaps');
      return to('AWAITING_ANSWERS');

    case 'GENERATE':
      if (status === 'MATCHED') {
        return hasGaps ? reject('the gaps must be answered or skipped first') : to('GENERATING');
      }
      if (status !== 'AWAITING_ANSWERS' && status !== 'REVIEW') return reject();
      return to('GENERATING');

    case 'RESUMES_READY':
      if (status !== 'GENERATING') return reject();
      return to('REVIEW');

    case 'FINALIZE':
      if (status !== 'REVIEW') return reject();
      return to('FINALIZED');

    case 'FAIL':
      if (status !== 'ANALYZING' && status !== 'GENERATING') return reject();
      return { ...session, status: 'FAILED', failedStep: status };

    case 'RETRY':
      if (status !== 'FAILED' || session.failedStep === null) return reject();
      return to(session.failedStep);
  }
}

/** Whether `event` can be applied now (e.g. to enable a button). */
export function canApplySessionEvent(
  session: TailoringSession,
  event: TailoringSessionEvent,
): boolean {
  try {
    applySessionEvent(session, event);
    return true;
  } catch (error) {
    if (error instanceof InvalidSessionTransitionError) return false;
    throw error;
  }
}
