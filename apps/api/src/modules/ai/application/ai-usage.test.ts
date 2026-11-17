import { describe, expect, it } from 'vitest';
import { dayStart, monthOf, summarizeUsage, tokensOnDay, usageReportStart } from './ai-usage.js';
import type { AiGenerationUsage } from './llm.ports.js';

/** An attempt made at a local date and time. */
function row(
  local: [number, number, number, number?],
  task: AiGenerationUsage['task'],
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
): AiGenerationUsage {
  const [year, month, day, hour = 12] = local;
  return {
    task,
    inputTokens,
    outputTokens,
    costUsd,
    createdAt: new Date(year, month - 1, day, hour).toISOString(),
  };
}

describe('summarizeUsage', () => {
  const rows = [
    row([2026, 11, 1, 0], 'cv-import', 1000, 200, 0.001),
    row([2026, 11, 1, 23], 'cv-import', 3000, 600, 0.003),
    row([2026, 11, 16], 'smoke-test', 10, 5, 0.0000001),
    row([2026, 10, 31, 23], 'cv-import', 500, 100, 0.0005),
    row([2025, 11, 30], 'cv-import', 7, 7, 0.07),
    row([2025, 12, 1], 'cv-import', 1, 1, 0.01),
  ];

  it('details the month by local day and by task', () => {
    const report = summarizeUsage(rows, '2026-11');

    expect(report.month).toBe('2026-11');
    expect(report.totals).toEqual({
      calls: 3,
      inputTokens: 4010,
      outputTokens: 805,
      costUsd: 0.004,
    });
    expect(report.byDay).toHaveLength(30);
    expect(report.byDay[0]).toEqual({
      day: '2026-11-01',
      calls: 2,
      inputTokens: 4000,
      outputTokens: 800,
      costUsd: 0.004,
    });
    expect(report.byDay[15]).toMatchObject({ day: '2026-11-16', calls: 1 });
    expect(report.byDay[29]).toMatchObject({ day: '2026-11-30', calls: 0 });
    expect(report.byTask.map((entry) => [entry.task, entry.calls])).toEqual([
      ['cv-import', 2],
      ['smoke-test', 1],
    ]);
  });

  it('covers the 12 months up to the month, oldest first, ignoring older calls', () => {
    const report = summarizeUsage(rows, '2026-11');

    expect(report.byMonth.map((entry) => entry.month)).toEqual([
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(report.byMonth[0]).toMatchObject({ calls: 1, costUsd: 0.01 });
    expect(report.byMonth[10]).toMatchObject({ calls: 1, inputTokens: 500 });
    expect(report.byMonth[11]).toMatchObject({ calls: 3 });
  });

  it('reports an empty month with zeros', () => {
    const report = summarizeUsage([], '2026-02');

    expect(report.totals).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    expect(report.byDay).toHaveLength(28);
    expect(report.byTask).toEqual([]);
  });

  it('starts the report 11 months before the month, in local time', () => {
    expect(usageReportStart('2026-11')).toEqual(new Date(2025, 11, 1));
    expect(monthOf(new Date(2026, 0, 31, 23, 59))).toBe('2026-01');
  });
});

describe('tokensOnDay', () => {
  it('adds input and output tokens of the local day, from its first to its last hour', () => {
    const rows = [
      row([2026, 11, 17, 0], 'jd-analysis', 1000, 200, 0.001),
      row([2026, 11, 17, 23], 'cv-import', 3000, 600, 0.003),
      row([2026, 11, 16, 23], 'cv-import', 50, 50, 0),
      row([2026, 11, 18, 0], 'cv-import', 70, 70, 0),
    ];
    expect(tokensOnDay(rows, '2026-11-17')).toBe(4800);
    expect(tokensOnDay(rows, '2026-11-15')).toBe(0);
    expect(dayStart('2026-11-17')).toEqual(new Date(2026, 10, 17));
  });
});
