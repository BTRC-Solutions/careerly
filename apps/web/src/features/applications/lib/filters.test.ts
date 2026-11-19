import type { ApplicationSummary } from '@careerly/contracts';
import { describe, expect, it } from 'vitest';
import { companiesOf, filterApplications, NO_FILTERS } from './filters';

const NOW = '2026-11-19T12:00:00.000Z';
const summary = (
  id: string,
  title: string | null,
  company: string | null,
  status: ApplicationSummary['status'],
  appliedAt: string | null,
): ApplicationSummary => ({
  id,
  jobPostingId: `jp-${id}`,
  title,
  company,
  status,
  ghostedFrom: null,
  appliedAt,
  priority: null,
  createdAt: NOW,
  updatedAt: NOW,
});

const LIST = [
  summary('1', 'Ingeniera de Datos', 'Acme', 'APPLIED', '2026-11-02'),
  summary('2', 'Backend Engineer', 'Globex', 'INTERVIEWING', '2026-11-10'),
  summary('3', 'Backend Developer', 'Acme', 'SAVED', null),
  summary('4', null, null, 'REJECTED', '2026-10-20'),
];
const ids = (list: ApplicationSummary[]) => list.map((a) => a.id);

describe('filtering the applications table', () => {
  it('keeps everything without filters', () => {
    expect(ids(filterApplications(LIST, NO_FILTERS))).toEqual(['1', '2', '3', '4']);
  });

  it('filters by states and company', () => {
    expect(
      ids(filterApplications(LIST, { ...NO_FILTERS, statuses: ['APPLIED', 'SAVED'] })),
    ).toEqual(['1', '3']);
    expect(ids(filterApplications(LIST, { ...NO_FILTERS, company: 'Acme' }))).toEqual(['1', '3']);
  });

  it('filters by the day it was sent, leaving out the ones not sent', () => {
    expect(
      ids(
        filterApplications(LIST, { ...NO_FILTERS, sentFrom: '2026-11-01', sentTo: '2026-11-10' }),
      ),
    ).toEqual(['1', '2']);
    expect(ids(filterApplications(LIST, { ...NO_FILTERS, sentTo: '2026-10-31' }))).toEqual(['4']);
  });

  it('searches every word in the title and company, ignoring case and accents', () => {
    expect(ids(filterApplications(LIST, { ...NO_FILTERS, query: 'backend acme' }))).toEqual(['3']);
    expect(ids(filterApplications(LIST, { ...NO_FILTERS, query: 'INGENIERA datos' }))).toEqual([
      '1',
    ]);
    expect(ids(filterApplications(LIST, { ...NO_FILTERS, query: 'ingeniéra' }))).toEqual(['1']);
  });

  it('lists the companies once, alphabetically', () => {
    expect(companiesOf(LIST)).toEqual(['Acme', 'Globex']);
  });
});
