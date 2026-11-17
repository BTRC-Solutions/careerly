import type { AiTask, AiUsageResponse, AiUsageTotals } from '@careerly/contracts';
import type { AiGenerationUsage } from './llm.ports.js';

/*
 * AI usage report (RF-CONF-06): calls, tokens and estimated cost per day, month and task. Days and months
 * are in local time (the backend runs on the user's computer), so reports match the user's calendar.
 */

/** "2026-11" → the first instant of that month in local time. */
export function monthStart(month: string): Date {
  const [year, index] = month.split('-').map(Number) as [number, number];
  return new Date(year, index - 1, 1);
}

/** The month of a date in local time, "2026-11". */
export function monthOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** The first instant of the oldest month in a 12-month report ending with `month`. */
export function usageReportStart(month: string): Date {
  const start = monthStart(month);
  return new Date(start.getFullYear(), start.getMonth() - 11, 1);
}

export function summarizeUsage(rows: AiGenerationUsage[], month: string): AiUsageResponse {
  const start = monthStart(month);
  const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const byDay = new Map<string, AiUsageTotals>(
    Array.from({ length: daysInMonth }, (_, index) => [`${month}-${pad(index + 1)}`, zero()]),
  );
  const months = Array.from({ length: 12 }, (_, index) =>
    monthOf(new Date(start.getFullYear(), start.getMonth() - 11 + index, 1)),
  );
  const byMonth = new Map<string, AiUsageTotals>(months.map((key) => [key, zero()]));
  const byTask = new Map<AiTask, AiUsageTotals>();
  const totals = zero();

  for (const row of rows) {
    const created = new Date(row.createdAt);
    const rowMonth = monthOf(created);
    const monthTotals = byMonth.get(rowMonth);
    if (monthTotals) add(monthTotals, row);
    if (rowMonth !== month) continue;
    add(totals, row);
    add(byDay.get(`${rowMonth}-${pad(created.getDate())}`)!, row);
    const task = byTask.get(row.task) ?? zero();
    byTask.set(row.task, add(task, row));
  }

  return {
    month,
    totals: rounded(totals),
    byDay: [...byDay].map(([day, value]) => ({ day, ...rounded(value) })),
    byTask: [...byTask]
      .map(([task, value]) => ({ task, ...rounded(value) }))
      .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls),
    byMonth: [...byMonth].map(([key, value]) => ({ month: key, ...rounded(value) })),
  };
}

function zero(): AiUsageTotals {
  return { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
}

function add(totals: AiUsageTotals, row: AiGenerationUsage): AiUsageTotals {
  totals.calls += 1;
  totals.inputTokens += row.inputTokens;
  totals.outputTokens += row.outputTokens;
  totals.costUsd += row.costUsd;
  return totals;
}

/** Costs are sums of small floats: keep 6 decimals (a millionth of a dollar). */
function rounded(totals: AiUsageTotals): AiUsageTotals {
  return { ...totals, costUsd: Math.round(totals.costUsd * 1e6) / 1e6 };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
