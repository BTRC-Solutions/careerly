// @vitest-environment jsdom
import type { JobView, Profile, TailoringSessionView } from '@careerly/contracts';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, apiServer, setupApiServer } from '../../../test-support/api-server';
import { renderScreen } from '../../../test-support/render';
import { MatchSummaryPage } from './MatchSummaryPage';

/* The match summary (roadmap 5.3, RF-TAIL-03) against a mocked API. */

setupApiServer();

const ID = 'session-1';

const provenance = {
  origin: 'MANUAL',
  originSessionId: null,
  createdAt: '2026-11-17T12:00:00.000Z',
  updatedAt: '2026-11-17T12:00:00.000Z',
} as const;

const PROFILE = {
  personalInfo: {
    firstNames: null,
    lastNames: null,
    headline: null,
    location: null,
    email: null,
    phone: null,
    summary: null,
    links: [],
    updatedAt: null,
  },
  positions: [
    {
      id: 'pos-1',
      company: 'Acme',
      title: 'Backend Engineer',
      location: null,
      workMode: null,
      startDate: '2019-03',
      endDate: null,
      context: null,
      tools: [{ id: 't-docker', name: 'Docker' }],
      achievements: [
        {
          id: 'ach-1',
          text: 'Designed the public REST API used by 40 partners.',
          metrics: null,
          tools: [{ id: 't-node', name: 'Node.js' }],
          ...provenance,
        },
      ],
      ...provenance,
    },
  ],
  projects: [],
  education: [],
  certifications: [],
  languages: [{ id: 'lang-1', language: 'English', level: 'C1', notes: null, ...provenance }],
} satisfies Profile;

const JOB: JobView = {
  id: 'job-1',
  type: 'tailoring-match',
  status: 'SUCCEEDED',
  attempts: 1,
  maxAttempts: 3,
  progress: null,
  lastError: null,
  createdAt: '2026-11-17T12:00:00.000Z',
  updatedAt: '2026-11-17T12:00:00.000Z',
  finishedAt: '2026-11-17T12:00:00.000Z',
};

const MATCHED: TailoringSessionView = {
  session: {
    id: ID,
    jobPostingId: 'posting-1',
    languages: ['en'],
    pageBudget: 1,
    templateId: 'classic',
    status: 'MATCHED',
    failedStep: null,
    regeneration: null,
    createdAt: '2026-11-17T12:00:00.000Z',
    updatedAt: '2026-11-17T12:00:00.000Z',
    match: {
      requirements: [
        {
          requirementId: 'r1',
          label: 'Node.js',
          kind: 'TOOL',
          importance: 'REQUIRED',
          tool: { id: 't-node', name: 'Node.js' },
          status: 'COVERED',
          method: 'TOOLS',
          evidence: [{ kind: 'ACHIEVEMENT', id: 'ach-1' }],
        },
        {
          requirementId: 'r2',
          label: 'Docker',
          kind: 'TOOL',
          importance: 'REQUIRED',
          tool: { id: 't-docker', name: 'Docker' },
          status: 'PARTIAL',
          method: 'TOOLS',
          evidence: [{ kind: 'POSITION', id: 'pos-1' }],
        },
        {
          requirementId: 'r3',
          label: 'Postgres',
          kind: 'TOOL',
          importance: 'REQUIRED',
          tool: { id: 't-pg', name: 'PostgreSQL' },
          status: 'MISSING',
          method: 'TOOLS',
          evidence: [],
        },
        {
          requirementId: 'r4',
          label: 'English (advanced)',
          kind: 'LANGUAGE',
          importance: 'NICE_TO_HAVE',
          tool: null,
          status: 'COVERED',
          method: 'AI',
          evidence: [
            { kind: 'LANGUAGE', id: 'lang-1' },
            // Deleted from the profile after the match.
            { kind: 'ACHIEVEMENT', id: 'ach-gone' },
          ],
        },
      ],
      promptVersion: 'evidence-match.v1',
      model: 'gemini-test',
      matchedAt: '2026-11-17T12:00:00.000Z',
    },
  },
  job: JOB,
};

let view: TailoringSessionView;
let retries: number;

beforeEach(() => {
  view = MATCHED;
  retries = 0;
  apiServer.use(
    http.get(api(`/tailoring-sessions/${ID}`), () => HttpResponse.json(view)),
    http.post(api(`/tailoring-sessions/${ID}/retry`), () => {
      retries += 1;
      view = MATCHED;
      return HttpResponse.json(view);
    }),
    http.get(api('/profile'), () => HttpResponse.json(PROFILE)),
    http.get(api(`/tailoring-sessions/${ID}/profile-changes`), () =>
      HttpResponse.json({ changes: [] }),
    ),
    http.get(api('/templates'), () =>
      HttpResponse.json([
        { id: 'classic', name: 'Clásica', version: 1, builtIn: true, finalizedResumes: 0 },
      ]),
    ),
    http.get(api('/job-postings/posting-1'), () =>
      HttpResponse.json({
        id: 'posting-1',
        title: 'Senior Backend Engineer',
        company: 'Fintech del Sur',
        url: null,
        location: null,
        workMode: null,
        salary: null,
        text: 'JD',
        createdAt: '2026-11-17T12:00:00.000Z',
        updatedAt: '2026-11-17T12:00:00.000Z',
      }),
    ),
  );
});

const render = (language: 'es' | 'en' = 'es') =>
  renderScreen(
    <Routes>
      <Route path="/tailoring/:id" element={<MatchSummaryPage />} />
    </Routes>,
    { path: `/tailoring/${ID}`, language },
  );

describe('MatchSummaryPage', () => {
  it('shows the score and the requirements grouped by status, with their evidence', async () => {
    await render();

    expect(await screen.findByText('Senior Backend Engineer · Fintech del Sur')).toBeVisible();
    // (2 + 1 + 0 + 1) of (2 + 2 + 2 + 1) = 57%.
    expect(screen.getByText('57%')).toBeVisible();
    expect(screen.getByText('2 cubiertos')).toBeVisible();
    expect(screen.getByText('1 parcial')).toBeVisible();
    expect(screen.getByText('1 faltante')).toBeVisible();

    const covered = screen
      .getByRole('heading', { name: 'Cubiertos' })
      .closest('div')!.parentElement!;
    expect(within(covered).getByText('Node.js')).toBeVisible();
    expect(
      await within(covered).findByText('Designed the public REST API used by 40 partners.', {
        exact: false,
      }),
    ).toBeVisible();
    expect(within(covered).getByText(/Backend Engineer · Acme/)).toBeVisible();
    // Each piece of evidence links to where it is edited in the profile.
    expect(
      within(covered).getByRole('link', { name: /Designed the public REST API/ }),
    ).toHaveAttribute('href', '/profile/experience/pos-1');
    expect(within(covered).getByRole('link', { name: /^English · C1/ })).toHaveAttribute(
      'href',
      '/profile/languages',
    );
    expect(within(covered).getByText(/English · C1/)).toBeVisible();
    expect(within(covered).getByText('ya no está en tu perfil')).toBeVisible();
    expect(within(covered).getByText(/Según la IA/)).toBeVisible();
    expect(within(covered).getByText('Deseable')).toBeVisible();

    const partial = screen
      .getByRole('heading', { name: 'Parciales' })
      .closest('div')!.parentElement!;
    expect(within(partial).getByText('Docker')).toBeVisible();
    expect(within(partial).getByText(/Experiencia:/)).toBeVisible();

    const missing = screen
      .getByRole('heading', { name: 'Faltantes' })
      .closest('div')!.parentElement!;
    expect(within(missing).getByText('Postgres')).toBeVisible();
    // The catalog name is shown when the job description used another one.
    expect(within(missing).getByText('PostgreSQL')).toBeVisible();

    expect(screen.getByText(/Comparado con gemini-test/)).toBeVisible();
    expect(screen.getByRole('link', { name: /Volver a la oferta/ })).toHaveAttribute(
      'href',
      '/job-postings/posting-1',
    );
  });

  it('shows the progress while the match runs', async () => {
    view = {
      session: { ...MATCHED.session, status: 'ANALYZING', match: null },
      job: { ...JOB, status: 'RUNNING', progress: { step: 'matching', done: 2, total: 5 } },
    };
    await render();
    expect(await screen.findByText(/buscando evidencia/)).toHaveAttribute('role', 'status');
    expect(screen.queryByText('Puntaje orientativo')).not.toBeInTheDocument();
  });

  it('explains a failure and retries it', async () => {
    view = {
      session: { ...MATCHED.session, status: 'FAILED', failedStep: 'ANALYZING', match: null },
      job: { ...JOB, status: 'FAILED', lastError: 'KEY_REJECTED' },
    };
    const { user } = await render();
    expect(await screen.findByRole('alert')).toHaveTextContent(/rechazó tu API key/);

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('57%')).toBeVisible();
    expect(retries).toBe(1);
  });

  it('is translated to English', async () => {
    await render('en');
    expect(
      await screen.findByRole('heading', { name: 'Match with the job posting' }),
    ).toBeVisible();
    expect(screen.getByText('2 covered')).toBeVisible();
    expect(screen.getByText('Indicative score')).toBeVisible();
  });

  it('says when the session does not exist', async () => {
    apiServer.use(
      http.get(api(`/tailoring-sessions/${ID}`), () =>
        HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Nope.' } }, { status: 404 }),
      ),
    );
    await render();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se encontró esta sesión.');
  });
});
