import { describe, expect, it } from 'vitest';
import { currentMonth, formatCount, formatUsd, shiftMonth } from './format';

describe('AI usage formats', () => {
  it('keeps small costs readable', () => {
    expect(formatUsd(0.0042, 'en')).toBe('$0.0042');
    expect(formatUsd(0, 'en')).toBe('$0.00');
    expect(formatUsd(12.5, 'en')).toBe('$12.50');
  });

  it('formats counts in the interface language', () => {
    expect(formatCount(1234567, 'en')).toBe('1,234,567');
  });

  it('moves between months across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(currentMonth(new Date(2026, 10, 16))).toBe('2026-11');
  });
});
