import type { PageBudget, Position } from '@careerly/contracts';

/*
 * Default page budget of a session (RF-TAIL-08, D-04): 1 page with less than 8 years of experience, 2 with 8 or
 * more. Years come from the positions of the master profile, overlapping ones counted once.
 */

export const TWO_PAGES_FROM_YEARS = 8;

type Dated = Pick<Position, 'startDate' | 'endDate'>;

/** "2023-04" → months since year 0. */
const monthIndex = (yearMonth: string) => {
  const [year, month] = yearMonth.split('-').map(Number);
  return year! * 12 + (month! - 1);
};

/** Whole years worked, counting each month once; a current position runs to `today` ("YYYY-MM"). */
export function yearsOfExperience(positions: readonly Dated[], today: string): number {
  const now = monthIndex(today);
  const spans = positions
    .map(({ startDate, endDate }) => [
      monthIndex(startDate),
      Math.min(monthIndex(endDate ?? today), now),
    ])
    .filter(([start, end]) => start! <= end!)
    .sort((a, b) => a[0]! - b[0]!);

  let months = 0;
  let coveredUntil = -Infinity;
  for (const [start, end] of spans) {
    // Months are inclusive: a position from 2020-01 to 2020-01 is one month.
    const from = Math.max(start!, coveredUntil + 1);
    if (end! >= from) months += end! - from + 1;
    coveredUntil = Math.max(coveredUntil, end!);
  }
  return Math.floor(months / 12);
}

export function defaultPageBudget(positions: readonly Dated[], today: string): PageBudget {
  return yearsOfExperience(positions, today) >= TWO_PAGES_FROM_YEARS ? 2 : 1;
}
