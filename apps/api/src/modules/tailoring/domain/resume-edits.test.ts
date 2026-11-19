import type { TailoredResumeData } from '@careerly/contracts';
import { describe, expect, it } from 'vitest';
import { applyResumeEdit, BulletNotFoundError } from './resume-edits.js';

const bullet = (id: string) => ({
  id,
  text: `Text ${id}`,
  sourceIds: ['a1'],
  score: null,
  editedByUser: false,
  inclusion: 'AUTO' as const,
});

const DATA: TailoredResumeData = {
  summary: { text: 'Summary.', sourceIds: ['w1'] },
  experiences: [
    { kind: 'POSITION', sourceId: 'w1', bullets: [bullet('b1'), bullet('b2'), bullet('b3')] },
    { kind: 'PROJECT', sourceId: 'p1', bullets: [bullet('b4')] },
  ],
  toolIds: [],
  guard: { rewritten: 0, dropped: [] },
  fit: null,
};

const ids = (data: TailoredResumeData) => data.experiences.map((e) => e.bullets.map((b) => b.id));

describe('applyResumeEdit (RF-TAIL-12)', () => {
  it('edits a bullet and marks it as the user’s, keeping its sources (RN-05)', () => {
    const data = applyResumeEdit(DATA, { op: 'EDIT_BULLET', bulletId: 'b2', text: ' New text ' });
    expect(data.experiences[0]!.bullets[1]).toEqual({
      ...bullet('b2'),
      text: 'New text',
      editedByUser: true,
    });
    // The same text is not an edit.
    const same = applyResumeEdit(DATA, { op: 'EDIT_BULLET', bulletId: 'b1', text: 'Text b1' });
    expect(same.experiences[0]!.bullets[0]!.editedByUser).toBe(false);
  });

  it('edits or removes the summary', () => {
    expect(applyResumeEdit(DATA, { op: 'EDIT_SUMMARY', text: 'Other.' }).summary).toEqual({
      text: 'Other.',
      sourceIds: ['w1'],
    });
    expect(applyResumeEdit(DATA, { op: 'EDIT_SUMMARY', text: '  ' }).summary).toBeNull();
  });

  it('moves a bullet inside its own experience', () => {
    expect(ids(applyResumeEdit(DATA, { op: 'MOVE_BULLET', bulletId: 'b3', toIndex: 0 }))).toEqual([
      ['b3', 'b1', 'b2'],
      ['b4'],
    ]);
    expect(ids(applyResumeEdit(DATA, { op: 'MOVE_BULLET', bulletId: 'b1', toIndex: 99 }))).toEqual([
      ['b2', 'b3', 'b1'],
      ['b4'],
    ]);
  });

  it('includes or excludes a bullet', () => {
    const data = applyResumeEdit(DATA, {
      op: 'SET_INCLUSION',
      bulletId: 'b4',
      inclusion: 'EXCLUDED',
    });
    expect(data.experiences[1]!.bullets[0]!.inclusion).toBe('EXCLUDED');
    expect(data.experiences[0]).toBe(DATA.experiences[0]);
  });

  it('rejects a bullet that is not in the CV', () => {
    expect(() =>
      applyResumeEdit(DATA, { op: 'SET_INCLUSION', bulletId: 'nope', inclusion: 'AUTO' }),
    ).toThrow(BulletNotFoundError);
  });
});
