import type { ApplicationStatus, ApplicationSummary } from '@careerly/contracts';

/** The table's filters (RF-APP-06): state, company, the day it was sent, and a search. */
export interface ApplicationFilters {
  statuses: ApplicationStatus[];
  /** Exact company name; `''` for any. */
  company: string;
  /** Sent on or after / before this day (YYYY-MM-DD); `''` for no limit. */
  sentFrom: string;
  sentTo: string;
  /** Words to find in the job title or the company, in any order, ignoring case and accents. */
  query: string;
}

export const NO_FILTERS: ApplicationFilters = {
  statuses: [],
  company: '',
  sentFrom: '',
  sentTo: '',
  query: '',
};

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export function filterApplications(
  applications: ApplicationSummary[],
  filters: ApplicationFilters,
): ApplicationSummary[] {
  const words = fold(filters.query).split(/\s+/).filter(Boolean);
  const dated = filters.sentFrom !== '' || filters.sentTo !== '';
  return applications.filter((application) => {
    if (filters.statuses.length > 0 && !filters.statuses.includes(application.status)) {
      return false;
    }
    if (filters.company !== '' && application.company !== filters.company) return false;
    if (dated) {
      const day = application.appliedAt;
      if (day === null) return false;
      if (filters.sentFrom !== '' && day < filters.sentFrom) return false;
      if (filters.sentTo !== '' && day > filters.sentTo) return false;
    }
    const haystack = fold(`${application.title ?? ''} ${application.company ?? ''}`);
    return words.every((word) => haystack.includes(word));
  });
}

/** The companies of the applications, without repeats, alphabetically. */
export function companiesOf(applications: ApplicationSummary[]): string[] {
  const names = new Set(
    applications.map((a) => a.company).filter((name): name is string => Boolean(name)),
  );
  return [...names].sort((a, b) => a.localeCompare(b));
}
