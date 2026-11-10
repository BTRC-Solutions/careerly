import { describe, expect, it } from 'vitest';
import { formatMonth, formatMonthRange, monthOrNull } from './dates';

describe('formatMonth', () => {
  it('formats in the given locale without the abbreviation dot', () => {
    expect(formatMonth('2023-04', 'en')).toBe('Apr 2023');
    expect(formatMonth('2023-04', 'es').toLowerCase()).toMatch(/^abr\s+(de\s+)?2023$/);
  });
});

describe('formatMonthRange', () => {
  it('covers closed, ongoing, single and missing dates', () => {
    expect(formatMonthRange('2020-01', '2021-06', 'en', 'Present')).toBe('Jan 2020 – Jun 2021');
    expect(formatMonthRange('2020-01', null, 'en', 'Present')).toBe('Jan 2020 – Present');
    expect(formatMonthRange('2020-01', null, 'en', null)).toBe('Jan 2020');
    expect(formatMonthRange(null, '2021-06', 'en', 'Present')).toBe('Jun 2021');
    expect(formatMonthRange(null, null, 'en', 'Present')).toBeNull();
  });
});

describe('monthOrNull', () => {
  it('maps empty month inputs to null', () => {
    expect(monthOrNull('')).toBeNull();
    expect(monthOrNull(undefined)).toBeNull();
    expect(monthOrNull('2024-02')).toBe('2024-02');
  });
});
