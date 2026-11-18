import { describe, expect, it } from 'vitest';
import { defaultPageBudget, yearsOfExperience } from './session-options.js';
import {
  changeSessionOptions,
  InvalidSessionTransitionError,
  startTailoringSession,
  TailoringSessionValidationError,
} from './tailoring-session.js';

const TODAY = '2026-11';

describe('yearsOfExperience', () => {
  it('counts overlapping positions once and current ones up to today', () => {
    expect(
      yearsOfExperience(
        [
          { startDate: '2016-01', endDate: '2019-12' }, // 4 years
          { startDate: '2019-01', endDate: '2020-12' }, // 1 more (2019 overlaps)
          { startDate: '2023-11', endDate: null }, // 3 years to 2026-11, inclusive
        ],
        TODAY,
      ),
    ).toBe(8);
  });

  it('is 0 without positions, and ignores dates after today', () => {
    expect(yearsOfExperience([], TODAY)).toBe(0);
    expect(yearsOfExperience([{ startDate: '2027-01', endDate: null }], TODAY)).toBe(0);
  });
});

describe('defaultPageBudget', () => {
  it('is 1 page under 8 years and 2 from 8 years on (D-04)', () => {
    expect(defaultPageBudget([{ startDate: '2019-01', endDate: '2026-11' }], TODAY)).toBe(1);
    expect(defaultPageBudget([{ startDate: '2018-12', endDate: '2026-11' }], TODAY)).toBe(2);
  });
});

describe('changeSessionOptions', () => {
  const session = startTailoringSession({
    id: 's1',
    jobPostingId: 'jp1',
    languages: ['es'],
    pageBudget: 1,
    templateId: 'classic',
  });

  it('changes only what is given', () => {
    expect(changeSessionOptions(session, { languages: ['es', 'en'] })).toEqual({
      ...session,
      languages: ['es', 'en'],
    });
    expect(changeSessionOptions(session, { pageBudget: 2, templateId: 'mine' })).toMatchObject({
      languages: ['es'],
      pageBudget: 2,
      templateId: 'mine',
    });
  });

  it('checks the options like starting a session does', () => {
    expect(() => changeSessionOptions(session, { languages: [] })).toThrow(
      TailoringSessionValidationError,
    );
    expect(() => changeSessionOptions(session, { languages: ['en', 'en'] })).toThrow(
      TailoringSessionValidationError,
    );
  });

  it('is not allowed while generating or once finalized', () => {
    for (const status of ['GENERATING', 'FINALIZED'] as const) {
      expect(() => changeSessionOptions({ ...session, status }, { pageBudget: 2 })).toThrow(
        InvalidSessionTransitionError,
      );
    }
    for (const status of ['MATCHED', 'AWAITING_ANSWERS', 'REVIEW', 'FAILED'] as const) {
      expect(changeSessionOptions({ ...session, status }, { pageBudget: 2 }).pageBudget).toBe(2);
    }
  });
});
