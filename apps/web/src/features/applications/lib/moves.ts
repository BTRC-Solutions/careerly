import {
  ACTIVE_APPLICATION_STATUSES,
  type ApplicationStatus,
  type ApplicationSummary,
  type ApplicationTransitionRefusal,
  TERMINAL_APPLICATION_STATUSES,
} from '@careerly/contracts';

/*
 * What moving an application needs, so the board asks for it before calling the API (roadmap 7.4). The same
 * rules as the aggregate on the server (roadmap 7.2), which still validates every move.
 */

/** Board columns: the active states, "no answer", and the closed ones together (roadmap 7.4). */
export const BOARD_COLUMNS = [
  'SAVED',
  'APPLIED',
  'SCREENING',
  'INTERVIEWING',
  'OFFER',
  'GHOSTED',
  'CLOSED',
] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export const CLOSED_STATUSES = TERMINAL_APPLICATION_STATUSES;

export function isClosed(status: ApplicationStatus): boolean {
  return (CLOSED_STATUSES as readonly ApplicationStatus[]).includes(status);
}

export function columnOf(status: ApplicationStatus): BoardColumn {
  return isClosed(status) ? 'CLOSED' : (status as BoardColumn);
}

type Movable = Pick<ApplicationSummary, 'status' | 'ghostedFrom' | 'appliedAt'>;

export type MovePlan =
  | { kind: 'same' }
  | { kind: 'refused'; reason: ApplicationTransitionRefusal }
  | {
      kind: 'move';
      /** It leaves a closed state (RN-10). */
      reopen: boolean;
      /** It goes to an earlier state: the user confirms it first (RN-09). */
      backward: boolean;
      /** It is sent for the first time: the user says with which CVs, or without one. */
      needsSentCv: boolean;
    };

function rank(status: ApplicationStatus): number | null {
  if (status === 'ACCEPTED') return ACTIVE_APPLICATION_STATUSES.length;
  const index = (ACTIVE_APPLICATION_STATUSES as readonly ApplicationStatus[]).indexOf(status);
  return index >= 0 ? index : null;
}

export function planMove(application: Movable, to: ApplicationStatus): MovePlan {
  const { status } = application;
  if (to === status) return { kind: 'same' };
  const reopen = isClosed(status);
  if (reopen && rank(to) === null) return { kind: 'refused', reason: 'INVALID_TARGET' };
  if (reopen && to === 'ACCEPTED') return { kind: 'refused', reason: 'INVALID_TARGET' };
  if (status === 'SAVED' && (to === 'REJECTED' || to === 'GHOSTED')) {
    return { kind: 'refused', reason: 'NOT_SENT' };
  }
  const where = reopen
    ? null
    : rank(status === 'GHOSTED' ? (application.ghostedFrom ?? 'APPLIED') : status);
  const target = rank(to);
  return {
    kind: 'move',
    reopen,
    backward: where !== null && target !== null && target < where,
    needsSentCv: application.appliedAt === null && target !== null && target >= 1,
  };
}

/** The states a card can be moved to from its menu, in board order (closed ones last). */
export function moveTargets(application: Movable): ApplicationStatus[] {
  const all: ApplicationStatus[] = [...ACTIVE_APPLICATION_STATUSES, 'GHOSTED', ...CLOSED_STATUSES];
  return all.filter((to) => planMove(application, to).kind === 'move');
}
