import { ApplicationSchema, DashboardSummarySchema, JobPostingSchema } from '@careerly/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { createTempDir } from '../../test-support/temp-dir.js';
import {
  type RunningServer,
  startTestServer,
  TEST_TOKEN,
  testConfig,
} from '../../test-support/test-server.js';

/*
 * Dashboard (roadmap 8.1, RF-DASH-01, RF-DASH-02), end to end: the numbers match the applications recorded
 * through the API.
 */

/** A day relative to today in the local time zone (YYYY-MM-DD), as the API records `appliedAt`. */
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

describe('dashboard (integration)', () => {
  let temp: ReturnType<typeof createTempDir> | undefined;
  let server: RunningServer | undefined;

  afterEach(async () => {
    await server?.close();
    temp?.cleanup();
    server = temp = undefined;
  });

  const api = (method: string, route: string, body?: unknown) =>
    fetch(`http://127.0.0.1:${server!.port}${route}`, {
      method,
      headers: { Authorization: `Bearer ${TEST_TOKEN}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  /** An application of a new job description, saved or sent `sentDaysAgo` days ago and moved to `to` now. */
  async function application(sentDaysAgo?: number, to = 'APPLIED') {
    const jd = JobPostingSchema.parse(
      await (
        await api('POST', '/job-postings', {
          text: 'Backend role. Node.js…',
          title: 'Backend',
          company: 'Acme',
        })
      ).json(),
    );
    const { id } = ApplicationSchema.parse(
      await (await api('POST', '/applications', { jobPostingId: jd.id })).json(),
    );
    if (sentDaysAgo === undefined) return;
    const sending = await api('POST', `/applications/${id}/sent-resumes`, {
      resumeVersionIds: [],
      sentWithoutCareerlyCv: true,
      sentAt: daysAgo(sentDaysAgo),
    });
    expect(sending.status).toBe(200);
    if (to === 'APPLIED') return;
    expect((await api('POST', `/applications/${id}/status`, { to })).status).toBe(200);
  }

  const summary = async (query = '') => {
    const response = await api('GET', `/dashboard/summary${query}`);
    expect(response.status).toBe(200);
    return DashboardSummarySchema.parse(await response.json());
  };

  it('summarizes the applications by state, response rate and days to the first answer', async () => {
    temp = createTempDir();
    server = await startTestServer(testConfig(temp.dir));

    expect(await summary()).toMatchObject({
      period: 'all',
      total: 0,
      sent: 0,
      responseRate: null,
      medianDaysToFirstResponse: null,
    });

    await application(); // saved
    await application(4, 'SCREENING'); // answered after 4 days
    await application(2, 'REJECTED'); // answered after 2 days
    await application(10); // sent, no answer yet
    await application(200, 'INTERVIEWING'); // answered after 200 days, outside the last 90

    const all = await summary();
    expect(all).toMatchObject({
      period: 'all',
      total: 5,
      sent: 4,
      responded: 3,
      responseRate: 0.75,
      medianDaysToFirstResponse: 4,
    });
    expect(all.byStatus).toMatchObject({
      SAVED: 1,
      APPLIED: 1,
      SCREENING: 1,
      INTERVIEWING: 1,
      REJECTED: 1,
      GHOSTED: 0,
    });

    // The states cover every application; the response metrics, those sent in the period.
    const recent = await summary('?period=90d');
    expect(recent).toMatchObject({ period: '90d', total: 5, sent: 3, responded: 2 });
    expect(recent.responseRate).toBeCloseTo(2 / 3);
    expect(recent.medianDaysToFirstResponse).toBe(3);

    expect((await api('GET', '/dashboard/summary?period=7d')).status).toBe(400);
  });
});
