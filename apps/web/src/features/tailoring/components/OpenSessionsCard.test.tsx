// @vitest-environment jsdom
import type { TailoringSessionSummary } from '@careerly/contracts';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, apiServer, setupApiServer } from '../../../test-support/api-server';
import { renderScreen } from '../../../test-support/render';
import { OpenSessionsCard } from './OpenSessionsCard';

/* The sessions left in progress (roadmap 6.8, RF-TAIL-15) against a mocked API. */

setupApiServer();

const AT = '2026-11-18T12:00:00.000Z';

let sessions: TailoringSessionSummary[];

beforeEach(() => {
  sessions = [
    {
      id: 'session-2',
      jobPostingId: 'posting-2',
      status: 'REVIEW',
      languages: ['en'],
      createdAt: AT,
      updatedAt: AT,
    },
    {
      id: 'session-1',
      jobPostingId: 'posting-1',
      status: 'AWAITING_ANSWERS',
      languages: ['es'],
      createdAt: AT,
      updatedAt: AT,
    },
  ];
  apiServer.use(
    http.get(api('/tailoring-sessions'), ({ request }) => {
      expect(new URL(request.url).searchParams.get('open')).toBe('true');
      return HttpResponse.json({ sessions });
    }),
    http.get(api('/job-postings/:id'), ({ params }) =>
      HttpResponse.json({
        id: params.id,
        title: params.id === 'posting-1' ? 'Backend Engineer' : 'Data Engineer',
        company: params.id === 'posting-1' ? 'Acme' : null,
        url: null,
        location: null,
        workMode: null,
        salary: null,
        text: 'JD',
        createdAt: AT,
        updatedAt: AT,
      }),
    ),
  );
});

describe('OpenSessionsCard', () => {
  it('links each session in progress, with its job posting and step', async () => {
    await renderScreen(<OpenSessionsCard />);

    expect(await screen.findByRole('heading', { name: 'Sesiones en curso' })).toBeVisible();
    expect(await screen.findByRole('link', { name: 'Data Engineer' })).toHaveAttribute(
      'href',
      '/tailoring/session-2',
    );
    expect(screen.getByRole('link', { name: 'Backend Engineer · Acme' })).toHaveAttribute(
      'href',
      '/tailoring/session-1',
    );
    expect(screen.getByText('En revisión')).toBeVisible();
    expect(screen.getByText('Preguntas')).toBeVisible();
  });

  it('shows nothing without sessions in progress', async () => {
    sessions = [];
    const { container } = await renderScreen(<OpenSessionsCard />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container).toBeEmptyDOMElement();
  });
});
