// @vitest-environment jsdom
import type { DashboardPeriod, DashboardSummary } from '@careerly/contracts';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, apiServer, setupApiServer } from '../../../test-support/api-server';
import { renderScreen } from '../../../test-support/render';
import { ApplicationsSummaryCard } from './ApplicationsSummaryCard';

/* The applications summary of the home screen (roadmap 8.1) against a mocked API. */

setupApiServer();

const NONE = {
  SAVED: 0,
  APPLIED: 0,
  SCREENING: 0,
  INTERVIEWING: 0,
  OFFER: 0,
  ACCEPTED: 0,
  REJECTED: 0,
  WITHDRAWN: 0,
  GHOSTED: 0,
};

const ALL: DashboardSummary = {
  period: 'all',
  byStatus: { ...NONE, SAVED: 1, APPLIED: 1, SCREENING: 1, REJECTED: 2 },
  total: 5,
  sent: 4,
  responded: 3,
  responseRate: 0.75,
  medianDaysToFirstResponse: 3.5,
};
const LAST_30: DashboardSummary = {
  ...ALL,
  period: '30d',
  sent: 0,
  responded: 0,
  responseRate: null,
  medianDaysToFirstResponse: null,
};

let summaries: Partial<Record<DashboardPeriod, DashboardSummary>>;

beforeEach(() => {
  summaries = { all: ALL, '30d': LAST_30 };
  apiServer.use(
    http.get(api('/dashboard/summary'), ({ request }) => {
      const period = (new URL(request.url).searchParams.get('period') ?? 'all') as DashboardPeriod;
      return HttpResponse.json(summaries[period]);
    }),
  );
});

describe('ApplicationsSummaryCard', () => {
  it('shows the response metrics and the applications by state', async () => {
    await renderScreen(<ApplicationsSummaryCard />);

    expect(await screen.findByText('75 %')).toBeInTheDocument();
    expect(screen.getByText('3 de 4 enviadas avanzaron o fueron rechazadas')).toBeInTheDocument();
    expect(screen.getByText('3,5 días')).toBeInTheDocument();

    const byState = within(
      screen
        .getByRole('heading', { name: '5 postulaciones por estado actual' })
        .closest('section')!,
    );
    expect(
      within(byState.getByText('Rechazada').closest('li')!).getByText('2'),
    ).toBeInTheDocument();
    expect(byState.getByRole('link', { name: 'Ver postulaciones' })).toHaveAttribute(
      'href',
      '/applications',
    );
  });

  it('changes the period of the response metrics', async () => {
    const { user } = await renderScreen(<ApplicationsSummaryCard />);
    await screen.findByText('75 %');

    await user.click(screen.getByRole('button', { name: '30 días' }));

    expect(await screen.findByText('Ninguna enviada en el período')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30 días' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('points to the job descriptions when there are no applications', async () => {
    summaries.all = { ...ALL, byStatus: NONE, total: 0, sent: 0, responded: 0 };
    await renderScreen(<ApplicationsSummaryCard />);

    expect(await screen.findByText(/Todavía no tenés postulaciones/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Empezá por cargar una oferta' })).toHaveAttribute(
      'href',
      '/job-postings',
    );
    expect(
      screen.queryByRole('group', { name: 'Período de las enviadas' }),
    ).not.toBeInTheDocument();
  });
});
