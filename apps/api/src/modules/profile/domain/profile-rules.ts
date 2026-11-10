import { ProfileValidationError } from './profile-errors.js';

/*
 * Pure rules of the master profile. Months are "YYYY-MM" strings, which compare correctly as text.
 */

/** An end month cannot be before its start month. Missing dates are allowed. */
export function assertDateRange(
  start: string | null,
  end: string | null,
  endField = 'endDate',
): void {
  if (start && end && end < start) {
    throw new ProfileValidationError(`${endField} cannot be before the start date.`);
  }
}

interface Dated {
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

/**
 * Reverse chronological order (RN-06): ongoing items (no end date) first, then by end date and start
 * date, newest first. Items without any date go last, newest created first.
 */
export function compareReverseChronological(a: Dated, b: Dated): number {
  const aUndated = !a.startDate && !a.endDate;
  const bUndated = !b.startDate && !b.endDate;
  if (aUndated !== bUndated) return aUndated ? 1 : -1;

  const ONGOING = '9999-12';
  return (
    compareDesc(a.endDate ?? ONGOING, b.endDate ?? ONGOING) ||
    compareDesc(a.startDate ?? '', b.startDate ?? '') ||
    compareDesc(a.createdAt, b.createdAt)
  );
}

/** Newest first by an optional month; items without it go last. */
export function compareByMonthDesc(a: string | null, b: string | null): number {
  if (!a || !b) return a === b ? 0 : a ? -1 : 1;
  return compareDesc(a, b);
}

const LANGUAGE_LEVEL_RANK: Record<string, number> = {
  NATIVE: 0,
  C2: 1,
  C1: 2,
  B2: 3,
  B1: 4,
  A2: 5,
  A1: 6,
};

/** Highest level first, then alphabetically. */
export function compareLanguageSkills(
  a: { level: string; language: string },
  b: { level: string; language: string },
): number {
  return (
    (LANGUAGE_LEVEL_RANK[a.level] ?? 99) - (LANGUAGE_LEVEL_RANK[b.level] ?? 99) ||
    a.language.localeCompare(b.language)
  );
}

/**
 * A reorder request must list exactly the current achievements, each once.
 * Anything else (missing, extra or repeated ids) is rejected so no achievement is lost or duplicated.
 */
export function assertIsPermutation(
  currentIds: readonly string[],
  requestedIds: readonly string[],
) {
  const requested = new Set(requestedIds);
  const sameSize = requested.size === requestedIds.length && requested.size === currentIds.length;
  if (!sameSize || !currentIds.every((id) => requested.has(id))) {
    throw new ProfileValidationError(
      'achievementIds must list every achievement of the parent exactly once.',
    );
  }
}

function compareDesc(a: string, b: string): number {
  return a < b ? 1 : a > b ? -1 : 0;
}
