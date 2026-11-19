import { describe, expect, it } from 'vitest';
import { columnOf, moveTargets, planMove } from './moves';

const app = (
  status: Parameters<typeof planMove>[0]['status'],
  extra: Partial<Parameters<typeof planMove>[0]> = {},
) => ({ status, ghostedFrom: null, appliedAt: '2026-11-10', ...extra });

describe('planning a move on the board', () => {
  it('puts the closed states in one column', () => {
    expect(['ACCEPTED', 'REJECTED', 'WITHDRAWN'].map((s) => columnOf(s as never))).toEqual([
      'CLOSED',
      'CLOSED',
      'CLOSED',
    ]);
    expect(columnOf('GHOSTED')).toBe('GHOSTED');
  });

  it('asks for the sent CVs the first time it goes past SAVED', () => {
    const saved = app('SAVED', { appliedAt: null });
    expect(planMove(saved, 'INTERVIEWING')).toEqual({
      kind: 'move',
      reopen: false,
      backward: false,
      needsSentCv: true,
    });
    expect(planMove(saved, 'WITHDRAWN')).toMatchObject({ kind: 'move', needsSentCv: false });
    expect(planMove(saved, 'GHOSTED')).toEqual({ kind: 'refused', reason: 'NOT_SENT' });
  });

  it('asks to confirm going back, also from where a ghosted one was', () => {
    expect(planMove(app('OFFER'), 'SCREENING')).toMatchObject({ backward: true });
    const ghosted = app('GHOSTED', { ghostedFrom: 'INTERVIEWING' });
    expect(planMove(ghosted, 'INTERVIEWING')).toMatchObject({ backward: false });
    expect(planMove(ghosted, 'APPLIED')).toMatchObject({ backward: true });
  });

  it('reopens a closed one only to an active state', () => {
    expect(planMove(app('REJECTED'), 'SCREENING')).toMatchObject({ kind: 'move', reopen: true });
    expect(planMove(app('REJECTED'), 'GHOSTED').kind).toBe('refused');
    expect(planMove(app('REJECTED'), 'ACCEPTED').kind).toBe('refused');
    expect(moveTargets(app('WITHDRAWN', { appliedAt: null }))).toEqual([
      'SAVED',
      'APPLIED',
      'SCREENING',
      'INTERVIEWING',
      'OFFER',
    ]);
  });

  it('offers every other state from an active one', () => {
    expect(moveTargets(app('APPLIED'))).toEqual([
      'SAVED',
      'SCREENING',
      'INTERVIEWING',
      'OFFER',
      'GHOSTED',
      'ACCEPTED',
      'REJECTED',
      'WITHDRAWN',
    ]);
  });
});
