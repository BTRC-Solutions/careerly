import { describe, expect, it } from 'vitest';
import { type DatedHistory, summarizeApplications } from './dashboard-summary.js';

const TODAY = '2026-11-20';

const saved: DatedHistory = { status: 'SAVED', appliedAt: null, statusChanges: [] };
const sent = (appliedAt: string, ...changes: [DatedHistory['status'], string][]): DatedHistory => ({
  status: changes.at(-1)?.[0] ?? 'APPLIED',
  appliedAt,
  statusChanges: [{ to: 'APPLIED', day: appliedAt }, ...changes.map(([to, day]) => ({ to, day }))],
});

describe('summarizeApplications (RF-DASH-01, RF-DASH-02)', () => {
  it('counts every application by its current state', () => {
    const summary = summarizeApplications(
      [saved, saved, sent('2026-11-01'), sent('2026-11-02', ['GHOSTED', '2026-11-15'])],
      'all',
      TODAY,
    );
    expect(summary.total).toBe(4);
    expect(summary.byStatus).toEqual({
      SAVED: 2,
      APPLIED: 1,
      SCREENING: 0,
      INTERVIEWING: 0,
      OFFER: 0,
      ACCEPTED: 0,
      REJECTED: 0,
      WITHDRAWN: 0,
      GHOSTED: 1,
    });
  });

  it('counts as answered those that advanced or were rejected, by their history', () => {
    const summary = summarizeApplications(
      [
        saved,
        sent('2026-11-01', ['SCREENING', '2026-11-04']),
        sent('2026-11-01', ['REJECTED', '2026-11-11']),
        // It advanced and then went silent: it was answered.
        sent('2026-11-02', ['INTERVIEWING', '2026-11-03'], ['GHOSTED', '2026-11-18']),
        sent('2026-11-05', ['GHOSTED', '2026-11-19']),
        sent('2026-11-06', ['WITHDRAWN', '2026-11-07']),
      ],
      'all',
      TODAY,
    );
    expect(summary).toMatchObject({ sent: 5, responded: 3, responseRate: 0.6 });
    // Waits of 3, 10 and 1 days.
    expect(summary.medianDaysToFirstResponse).toBe(3);
  });

  it('takes the first answer and averages the two middle waits when they are even', () => {
    const summary = summarizeApplications(
      [
        sent('2026-11-01', ['SCREENING', '2026-11-03'], ['OFFER', '2026-11-15']),
        sent('2026-11-01', ['REJECTED', '2026-11-06']),
      ],
      'all',
      TODAY,
    );
    expect(summary.medianDaysToFirstResponse).toBe(3.5);
  });

  it('treats an answer recorded before the sending day as the same day', () => {
    const summary = summarizeApplications(
      [sent('2026-11-10', ['SCREENING', '2026-11-08'])],
      'all',
      TODAY,
    );
    expect(summary.medianDaysToFirstResponse).toBe(0);
  });

  it('limits the response metrics to those sent in the period, today included', () => {
    const histories = [
      sent('2026-10-22', ['SCREENING', '2026-10-25']), // the first of the last 30 days
      sent('2026-10-21', ['SCREENING', '2026-10-30']), // the day before
      sent('2026-08-01', ['REJECTED', '2026-08-03']), // more than 90 days ago
      saved,
    ];
    expect(summarizeApplications(histories, '30d', TODAY)).toMatchObject({
      sent: 1,
      responded: 1,
      medianDaysToFirstResponse: 3,
      total: 4,
    });
    expect(summarizeApplications(histories, '90d', TODAY)).toMatchObject({ sent: 2 });
    expect(summarizeApplications(histories, 'all', TODAY)).toMatchObject({ sent: 3 });
  });

  it('has no rate or median without data', () => {
    expect(summarizeApplications([saved], '30d', TODAY)).toMatchObject({
      total: 1,
      sent: 0,
      responded: 0,
      responseRate: null,
      medianDaysToFirstResponse: null,
    });
    expect(summarizeApplications([sent('2026-11-19')], 'all', TODAY)).toMatchObject({
      responseRate: 0,
      medianDaysToFirstResponse: null,
    });
  });
});
