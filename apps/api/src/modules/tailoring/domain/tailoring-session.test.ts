import type { MatchResult, MatchStatus, TailoringSessionStatus } from '@careerly/contracts';
import { describe, expect, it } from 'vitest';
import {
  applySessionEvent,
  canApplySessionEvent,
  InvalidSessionTransitionError,
  startTailoringSession,
  TAILORING_SESSION_EVENT_TYPES,
  type NewTailoringSession,
  type TailoringSession,
  type TailoringSessionEvent,
  type TailoringSessionEventType,
} from './tailoring-session.js';

const newSession = () =>
  startTailoringSession({
    id: 's1',
    jobPostingId: 'jp1',
    languages: ['es', 'en'],
    pageBudget: 1,
    templateId: 'classic',
  });

const replay = (...events: TailoringSessionEvent[]): TailoringSession =>
  events.reduce(applySessionEvent, newSession());

/** A match with one covered requirement and `gaps` missing ones. */
const matchWith = (gaps: number): MatchResult => ({
  requirements: (['COVERED', ...Array<MatchStatus>(gaps).fill('MISSING')] as MatchStatus[]).map(
    (status, index) => ({
      requirementId: `r${index}`,
      label: `Requirement ${index}`,
      kind: 'SKILL',
      importance: 'REQUIRED',
      tool: null,
      status,
      method: 'AI',
      evidence: status === 'COVERED' ? [{ kind: 'ACHIEVEMENT', id: 'a1' }] : [],
    }),
  ),
  promptVersion: 'evidence-match.v1',
  model: 'fake',
  matchedAt: '2026-11-17T10:00:00.000Z',
});

const withGaps: TailoringSessionEvent = { type: 'MATCH_READY', match: matchWith(2) };
const noGaps: TailoringSessionEvent = { type: 'MATCH_READY', match: matchWith(0) };

/** Every reachable situation, reached through valid events. */
const situations: Record<string, TailoringSession> = {
  analyzing: replay(),
  'matched, with gaps': replay(withGaps),
  'matched, no gaps': replay(noGaps),
  'awaiting answers': replay(withGaps, { type: 'ASK_GAPS' }),
  'generating, with gaps': replay(withGaps, { type: 'ASK_GAPS' }, { type: 'GENERATE' }),
  'generating, no gaps': replay(noGaps, { type: 'GENERATE' }),
  'review, with gaps': replay(
    withGaps,
    { type: 'ASK_GAPS' },
    { type: 'GENERATE' },
    { type: 'RESUMES_READY' },
  ),
  'review, no gaps': replay(noGaps, { type: 'GENERATE' }, { type: 'RESUMES_READY' }),
  finalized: replay(noGaps, { type: 'GENERATE' }, { type: 'RESUMES_READY' }, { type: 'FINALIZE' }),
  'failed while analyzing': replay({ type: 'FAIL' }),
  'failed while generating': replay(noGaps, { type: 'GENERATE' }, { type: 'FAIL' }),
};

/** The only allowed transitions (ARCHITECTURE §7.1); anything missing must be rejected. */
const allowed: Record<
  string,
  Partial<Record<TailoringSessionEventType, TailoringSessionStatus>>
> = {
  analyzing: { MATCH_READY: 'MATCHED', FAIL: 'FAILED' },
  'matched, with gaps': { ASK_GAPS: 'AWAITING_ANSWERS' },
  'matched, no gaps': { GENERATE: 'GENERATING' },
  'awaiting answers': { GENERATE: 'GENERATING' },
  'generating, with gaps': { RESUMES_READY: 'REVIEW', FAIL: 'FAILED' },
  'generating, no gaps': { RESUMES_READY: 'REVIEW', FAIL: 'FAILED' },
  'review, with gaps': {
    GENERATE: 'GENERATING',
    ASK_GAPS: 'AWAITING_ANSWERS',
    FINALIZE: 'FINALIZED',
  },
  'review, no gaps': { GENERATE: 'GENERATING', FINALIZE: 'FINALIZED' },
  finalized: {},
  'failed while analyzing': { RETRY: 'ANALYZING' },
  'failed while generating': { RETRY: 'GENERATING' },
};

const eventOf = (type: TailoringSessionEventType): TailoringSessionEvent =>
  type === 'MATCH_READY' ? { type, match: matchWith(1) } : { type };

const cases = Object.entries(situations).flatMap(([name, session]) =>
  TAILORING_SESSION_EVENT_TYPES.map((type) => ({
    name,
    session,
    type,
    expected: allowed[name]?.[type] ?? null,
  })),
);

describe('TailoringSession state machine', () => {
  it('starts analyzing, with no match yet', () => {
    expect(newSession()).toEqual({
      id: 's1',
      jobPostingId: 'jp1',
      languages: ['es', 'en'],
      pageBudget: 1,
      templateId: 'classic',
      status: 'ANALYZING',
      match: null,
      failedStep: null,
    });
  });

  it.each(cases.filter((c) => c.expected !== null))(
    '$name + $type → $expected',
    ({ session, type, expected }) => {
      expect(applySessionEvent(session, eventOf(type)).status).toBe(expected);
      expect(canApplySessionEvent(session, eventOf(type))).toBe(true);
    },
  );

  it.each(cases.filter((c) => c.expected === null))(
    '$name + $type is rejected',
    ({ session, type }) => {
      expect(() => applySessionEvent(session, eventOf(type))).toThrow(
        InvalidSessionTransitionError,
      );
      expect(canApplySessionEvent(session, eventOf(type))).toBe(false);
    },
  );

  it('says which status and event were rejected', () => {
    const error = (() => {
      try {
        applySessionEvent(situations.finalized!, { type: 'GENERATE' });
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(InvalidSessionTransitionError);
    expect(error).toMatchObject({ from: 'FINALIZED', event: 'GENERATE' });
  });

  it('keeps the match through the next steps', () => {
    expect(situations['matched, with gaps']!.match).toEqual(matchWith(2));
    expect(situations['review, with gaps']!.match).toEqual(matchWith(2));
    expect(situations['matched, no gaps']!.match).toEqual(matchWith(0));
  });

  it('counts partial requirements as gaps', () => {
    const partial = matchWith(0);
    partial.requirements[0]!.status = 'PARTIAL';
    const session = applySessionEvent(newSession(), { type: 'MATCH_READY', match: partial });
    expect(applySessionEvent(session, { type: 'ASK_GAPS' }).status).toBe('AWAITING_ANSWERS');
  });

  it('remembers the failed step until the retry', () => {
    expect(situations['failed while analyzing']!.failedStep).toBe('ANALYZING');
    expect(situations['failed while generating']!.failedStep).toBe('GENERATING');
    const retried = applySessionEvent(situations['failed while generating']!, { type: 'RETRY' });
    expect(retried.failedStep).toBeNull();
    expect(retried.match).toEqual(matchWith(0));
  });

  it('can fail and retry again after a regeneration', () => {
    const session = replay(
      noGaps,
      { type: 'GENERATE' },
      { type: 'RESUMES_READY' },
      { type: 'GENERATE' },
      { type: 'FAIL' },
      { type: 'RETRY' },
      { type: 'RESUMES_READY' },
      { type: 'FINALIZE' },
    );
    expect(session.status).toBe('FINALIZED');
  });

  it('does not modify the session it is given', () => {
    const session = newSession();
    const snapshot = structuredClone(session);
    applySessionEvent(session, withGaps);
    expect(session).toEqual(snapshot);
  });

  const invalidOptions: [Partial<NewTailoringSession>, RegExp][] = [
    [{ languages: [] }, /At least one output language/],
    [{ languages: ['es', 'es'] }, /must not repeat/],
    [{ templateId: '  ' }, /A template is required/],
  ];

  it.each(invalidOptions)('rejects invalid options: %o', (override, message) => {
    expect(() =>
      startTailoringSession({
        id: 's1',
        jobPostingId: 'jp1',
        languages: ['es'],
        pageBudget: 2,
        templateId: 'classic',
        ...override,
      }),
    ).toThrow(message);
  });
});
