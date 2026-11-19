import {
  ACTIVE_APPLICATION_STATUSES,
  type ApplicationStatus,
  ApplicationStatusSchema,
  type ApplicationTransitionRefusal,
} from '@careerly/contracts';
import { describe, expect, it } from 'vitest';
import {
  type Application,
  type ApplicationEvent,
  applyApplicationEvent,
  InvalidApplicationTransitionError,
  newApplication,
} from './application.js';

const AT = '2026-11-19T12:00:00.000Z';
const LATER = '2026-11-25T09:30:00.000Z';
const STATUSES = ApplicationStatusSchema.options;

const move = (to: ApplicationStatus, extra: Partial<ApplicationEvent> = {}): ApplicationEvent =>
  ({ type: 'MOVE', to, at: AT, ...extra }) as ApplicationEvent;

const apply = (application: Application, event: ApplicationEvent) =>
  applyApplicationEvent(application, event).application;

/** A saved application with one finalized CV already associated (roadmap 7.3), so it can be sent. */
const saved = (): Application => ({
  ...newApplication({ id: 'a1', jobPostingId: 'jp1' }),
  sentResumeCount: 1,
});

/** Every situation, reached through valid events. */
const situations: Record<string, Application> = {
  SAVED: saved(),
  APPLIED: apply(saved(), move('APPLIED')),
  SCREENING: apply(saved(), move('SCREENING')),
  INTERVIEWING: apply(saved(), move('INTERVIEWING')),
  OFFER: apply(saved(), move('OFFER')),
  ACCEPTED: apply(saved(), move('ACCEPTED')),
  REJECTED: apply(apply(saved(), move('APPLIED')), move('REJECTED')),
  WITHDRAWN: apply(saved(), move('WITHDRAWN')),
  'GHOSTED from SCREENING': apply(apply(saved(), move('SCREENING')), move('GHOSTED')),
};

const ok = 'ok' as const;
const SAME: ApplicationTransitionRefusal = 'SAME_STATUS';
const BACK: ApplicationTransitionRefusal = 'NEEDS_CONFIRMATION';
const CLOSED: ApplicationTransitionRefusal = 'CLOSED';
const UNSENT: ApplicationTransitionRefusal = 'NOT_SENT';

/**
 * What a plain MOVE (nothing confirmed) does, for every situation and target, in the order of `STATUSES`:
 * SAVED, APPLIED, SCREENING, INTERVIEWING, OFFER, ACCEPTED, REJECTED, WITHDRAWN, GHOSTED.
 */
const MOVES: Record<string, (typeof ok | ApplicationTransitionRefusal)[]> = {
  SAVED: [SAME, ok, ok, ok, ok, ok, UNSENT, ok, UNSENT],
  APPLIED: [BACK, SAME, ok, ok, ok, ok, ok, ok, ok],
  SCREENING: [BACK, BACK, SAME, ok, ok, ok, ok, ok, ok],
  INTERVIEWING: [BACK, BACK, BACK, SAME, ok, ok, ok, ok, ok],
  OFFER: [BACK, BACK, BACK, BACK, SAME, ok, ok, ok, ok],
  ACCEPTED: Array(9).fill(CLOSED),
  REJECTED: Array(9).fill(CLOSED),
  WITHDRAWN: Array(9).fill(CLOSED),
  'GHOSTED from SCREENING': [BACK, BACK, ok, ok, ok, ok, ok, ok, SAME],
};

const outcome = (application: Application, event: ApplicationEvent) => {
  try {
    applyApplicationEvent(application, event);
    return ok;
  } catch (error) {
    if (error instanceof InvalidApplicationTransitionError) return error.reason;
    throw error;
  }
};

describe('application state machine', () => {
  it('starts saved and not sent', () => {
    expect(newApplication({ id: 'a1', jobPostingId: 'jp1' })).toEqual({
      id: 'a1',
      jobPostingId: 'jp1',
      status: 'SAVED',
      ghostedFrom: null,
      appliedAt: null,
      sentResumeCount: 0,
      sentWithoutCareerlyCv: false,
    });
  });

  it('reaches every situation it is tested from', () => {
    expect(Object.keys(MOVES)).toEqual(Object.keys(situations));
    for (const [name, application] of Object.entries(situations)) {
      expect(application.status, name).toBe(name.split(' ')[0]);
    }
  });

  describe.each(Object.entries(situations))('a MOVE from %s', (name, application) => {
    it.each(STATUSES.map((to, index) => [to, MOVES[name]![index]!] as const))(
      'to %s: %s',
      (to, expected) => {
        expect(outcome(application, move(to))).toBe(expected);
      },
    );
  });

  it('skips states forward (RN-08) and records the change for the timeline', () => {
    const { application, change } = applyApplicationEvent(situations.APPLIED!, move('OFFER'));
    expect(application.status).toBe('OFFER');
    expect(change).toEqual({
      from: 'APPLIED',
      to: 'OFFER',
      backward: false,
      reopened: false,
      at: AT,
    });
  });

  it('goes back to an earlier state only when confirmed, and says so in the change (RN-09)', () => {
    for (const [name, application] of Object.entries(situations)) {
      STATUSES.forEach((to, index) => {
        if (MOVES[name]![index] !== BACK) return;
        const { application: moved, change } = applyApplicationEvent(
          application,
          move(to, { confirmBackward: true }),
        );
        expect(moved.status, `${name} → ${to}`).toBe(to);
        expect(change.backward, `${name} → ${to}`).toBe(true);
      });
    }
    // Confirming a forward move changes nothing.
    expect(
      applyApplicationEvent(situations.APPLIED!, move('SCREENING', { confirmBackward: true }))
        .change.backward,
    ).toBe(false);
  });

  describe('sending', () => {
    const unsent = () => newApplication({ id: 'a1', jobPostingId: 'jp1' });

    it('needs a finalized CV or the confirmation that it went without one, by any jump', () => {
      for (const to of ['APPLIED', 'SCREENING', 'INTERVIEWING', 'OFFER', 'ACCEPTED'] as const) {
        expect(outcome(unsent(), move(to)), to).toBe('NEEDS_SENT_CV');
        const confirmed = apply(unsent(), move(to, { sentWithoutCareerlyCv: true }));
        expect(confirmed).toMatchObject({ status: to, appliedAt: AT, sentWithoutCareerlyCv: true });
      }
      // Discarding it before sending needs nothing.
      expect(apply(unsent(), move('WITHDRAWN')).appliedAt).toBeNull();
    });

    it('takes the date it was sent when given, and keeps it when going back to SAVED', () => {
      const applied = apply(saved(), move('APPLIED', { appliedAt: '2026-11-15' }));
      expect(applied.appliedAt).toBe('2026-11-15');

      const back = apply(applied, move('SAVED', { confirmBackward: true }));
      expect(back).toMatchObject({ status: 'SAVED', appliedAt: '2026-11-15' });
      // Sent once: moving forward again needs nothing more and keeps the first date.
      const again = apply({ ...back, sentResumeCount: 0 }, { ...move('SCREENING'), at: LATER });
      expect(again).toMatchObject({ status: 'SCREENING', appliedAt: '2026-11-15' });
    });
  });

  describe('ghosted', () => {
    it('remembers the state it came from, and forgets it when it leaves', () => {
      const ghosted = situations['GHOSTED from SCREENING']!;
      expect(ghosted.ghostedFrom).toBe('SCREENING');
      expect(apply(ghosted, move('INTERVIEWING'))).toMatchObject({
        status: 'INTERVIEWING',
        ghostedFrom: null,
      });
      expect(apply(ghosted, move('REJECTED')).ghostedFrom).toBeNull();
    });

    it('returns freely to where it was, and with confirmation to an earlier state', () => {
      const ghosted = situations['GHOSTED from SCREENING']!;
      expect(applyApplicationEvent(ghosted, move('SCREENING')).change.backward).toBe(false);
      expect(
        applyApplicationEvent(ghosted, move('APPLIED', { confirmBackward: true })).change,
      ).toMatchObject({ from: 'GHOSTED', to: 'APPLIED', backward: true });
    });
  });

  describe('reopening (RN-10)', () => {
    const closed = ['ACCEPTED', 'REJECTED', 'WITHDRAWN'] as const;

    it('leaves a closed application in any active state the user picks', () => {
      for (const from of closed) {
        for (const to of ACTIVE_APPLICATION_STATUSES) {
          const { application, change } = applyApplicationEvent(situations[from]!, {
            type: 'REOPEN',
            to,
            at: AT,
          });
          expect(application.status, `${from} → ${to}`).toBe(to);
          expect(change).toEqual({ from, to, backward: false, reopened: true, at: AT });
        }
      }
    });

    it('reopens only closed applications, and only to an active state', () => {
      for (const from of ['SAVED', 'APPLIED', 'OFFER', 'GHOSTED from SCREENING']) {
        expect(outcome(situations[from]!, { type: 'REOPEN', to: 'APPLIED', at: AT }), from).toBe(
          'NOT_CLOSED',
        );
      }
      for (const to of ['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'GHOSTED'] as const) {
        const event = { type: 'REOPEN', to, at: AT } as unknown as ApplicationEvent;
        expect(outcome(situations.REJECTED!, event), to).toBe('INVALID_TARGET');
      }
    });

    it('still needs a sent CV to reopen past SAVED one that was never sent', () => {
      const discarded = apply(newApplication({ id: 'a1', jobPostingId: 'jp1' }), move('WITHDRAWN'));
      expect(outcome(discarded, { type: 'REOPEN', to: 'APPLIED', at: AT })).toBe('NEEDS_SENT_CV');
      expect(apply(discarded, { type: 'REOPEN', to: 'SAVED', at: AT }).status).toBe('SAVED');
      expect(
        apply(discarded, { type: 'REOPEN', to: 'APPLIED', at: AT, sentWithoutCareerlyCv: true }),
      ).toMatchObject({ status: 'APPLIED', appliedAt: AT });
    });
  });
});
