import { describe, expect, it } from 'vitest';
import { ProfileValidationError } from './profile-errors.js';
import {
  assertDateRange,
  assertIsPermutation,
  compareByMonthDesc,
  compareLanguageSkills,
  compareReverseChronological,
} from './profile-rules.js';

const item = (startDate: string | null, endDate: string | null, createdAt = '2026-01-01') => ({
  startDate,
  endDate,
  createdAt,
});

describe('assertDateRange', () => {
  it('accepts open, equal and increasing ranges', () => {
    expect(() => assertDateRange('2020-01', null)).not.toThrow();
    expect(() => assertDateRange(null, '2020-01')).not.toThrow();
    expect(() => assertDateRange('2020-01', '2020-01')).not.toThrow();
    expect(() => assertDateRange('2019-12', '2020-01')).not.toThrow();
  });

  it('rejects an end before the start', () => {
    expect(() => assertDateRange('2020-02', '2020-01')).toThrow(ProfileValidationError);
  });
});

describe('compareReverseChronological', () => {
  it('puts current items first, then newest, and undated items last', () => {
    const items = {
      old: item('2015-01', '2017-06'),
      undated: item(null, null),
      current: item('2021-03', null),
      recent: item('2018-01', '2021-02'),
      sameEndLaterStart: item('2019-01', '2021-02'),
    };
    const sorted = Object.entries(items)
      .sort(([, a], [, b]) => compareReverseChronological(a, b))
      .map(([name]) => name);
    expect(sorted).toEqual(['current', 'sameEndLaterStart', 'recent', 'old', 'undated']);
  });
});

describe('compareByMonthDesc', () => {
  it('sorts newest first with missing dates last', () => {
    expect(['2020-01', null, '2023-05'].sort(compareByMonthDesc)).toEqual([
      '2023-05',
      '2020-01',
      null,
    ]);
  });
});

describe('compareLanguageSkills', () => {
  it('sorts by level, highest first', () => {
    const skills = [
      { language: 'Portugués', level: 'A2' },
      { language: 'Inglés', level: 'C1' },
      { language: 'Español', level: 'NATIVE' },
    ];
    expect(skills.sort(compareLanguageSkills).map((s) => s.language)).toEqual([
      'Español',
      'Inglés',
      'Portugués',
    ]);
  });
});

describe('assertIsPermutation', () => {
  it('accepts the same ids in another order', () => {
    expect(() => assertIsPermutation(['a', 'b', 'c'], ['c', 'a', 'b'])).not.toThrow();
  });

  it.each([
    ['a missing id', ['a', 'b']],
    ['an unknown id', ['a', 'b', 'x']],
    ['a repeated id', ['a', 'b', 'b']],
    ['an extra id', ['a', 'b', 'c', 'd']],
  ])('rejects %s', (_case, requested) => {
    expect(() => assertIsPermutation(['a', 'b', 'c'], requested)).toThrow(ProfileValidationError);
  });
});
