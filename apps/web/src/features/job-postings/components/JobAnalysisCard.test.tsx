// @vitest-environment jsdom
import type { JobAnalysis, JobView, UpdateJobAnalysisRequest } from '@careerly/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, apiError, apiServer, setupApiServer } from '../../../test-support/api-server';
import { renderScreen } from '../../../test-support/render';
import { JobAnalysisCard } from './JobAnalysisCard';

/* Reading and correcting the job description analysis (roadmap 4.6, RF-JD-03) against a mocked API. */

setupApiServer();

const ID = 'posting-1';

const ANALYSIS: JobAnalysis = {
  jobPostingId: ID,
  language: 'en',
  roleCategory: 'backend',
  seniority: 'senior',
  workMode: 'hybrid',
  country: 'AR',
  yearsOfExperience: 5,
  keywords: ['APIs', 'Backend'],
  requirements: [
    {
      id: 'r1',
      label: 'Node.js',
      kind: 'TOOL',
      importance: 'REQUIRED',
      tool: { id: 't1', name: 'Node.js' },
    },
    {
      id: 'r2',
      label: 'Postgres',
      kind: 'TOOL',
      importance: 'REQUIRED',
      tool: { id: 't2', name: 'PostgreSQL' },
    },
    { id: 'r3', label: 'FooBarDB', kind: 'TOOL', importance: 'NICE_TO_HAVE', tool: null },
  ],
  promptVersion: 'jd-analysis.v1',
  model: 'gemini-test',
  analyzedAt: '2026-11-17T12:00:00.000Z',
  editedAt: null,
};

const JOB: JobView = {
  id: 'job-1',
  type: 'jd-analysis',
  status: 'SUCCEEDED',
  attempts: 1,
  maxAttempts: 3,
  progress: null,
  lastError: null,
  createdAt: '2026-11-17T12:00:00.000Z',
  updatedAt: '2026-11-17T12:00:00.000Z',
  finishedAt: '2026-11-17T12:00:00.000Z',
};

/** What the mocked API has; the PATCH handler stores the corrections like the real one would. */
let analysis: JobAnalysis;
let corrections: UpdateJobAnalysisRequest[];
let analyzeCalls: number;

beforeEach(() => {
  analysis = ANALYSIS;
  corrections = [];
  analyzeCalls = 0;
  apiServer.use(
    http.get(api('/ai/status'), () =>
      HttpResponse.json({ configured: true, provider: 'gemini', keyRejected: false }),
    ),
    http.get(api(`/job-postings/${ID}/analysis`), () => HttpResponse.json({ analysis, job: JOB })),
    http.patch(api(`/job-postings/${ID}/analysis`), async ({ request }) => {
      const body = (await request.json()) as UpdateJobAnalysisRequest;
      corrections.push(body);
      analysis = {
        ...analysis,
        ...body,
        requirements: body.requirements.map((requirement, index) => ({
          ...requirement,
          id: requirement.id ?? `new-${index}`,
          tool: null,
        })),
        editedAt: '2026-11-17T13:00:00.000Z',
      };
      return HttpResponse.json(analysis);
    }),
    http.post(api(`/job-postings/${ID}/analyze`), () => {
      analyzeCalls += 1;
      return HttpResponse.json({ ...JOB, status: 'SUCCEEDED' }, { status: 202 });
    }),
  );
});

function card() {
  return renderScreen(<JobAnalysisCard jobPostingId={ID} />);
}

async function startEditing(user: Awaited<ReturnType<typeof card>>['user']) {
  await user.click(await screen.findByRole('button', { name: 'Corregir' }));
  return within(screen.getByRole('form', { name: 'Corregir el análisis' }));
}

describe('JobAnalysisCard corrections', () => {
  it('adds and removes requirements and changes the facts', async () => {
    const { user } = await card();
    const form = await startEditing(user);

    await user.click(form.getByRole('button', { name: 'Quitar «FooBarDB»' }));
    await user.click(form.getByRole('button', { name: 'Agregar requisito' }));
    await user.type(form.getByRole('textbox', { name: 'Requisito 3' }), 'Inglés avanzado');
    await user.selectOptions(
      form.getByRole('combobox', { name: 'Tipo del requisito 3' }),
      'Idioma',
    );
    await user.selectOptions(
      form.getByRole('combobox', { name: 'Importancia del requisito 2' }),
      'Deseable',
    );
    await user.selectOptions(form.getByRole('combobox', { name: 'Seniority' }), 'Semi senior');
    await user.clear(form.getByRole('textbox', { name: 'País' }));
    await user.type(form.getByRole('textbox', { name: 'País' }), 'es');
    await user.clear(form.getByRole('textbox', { name: 'Palabras clave' }));
    await user.type(
      form.getByRole('textbox', { name: 'Palabras clave' }),
      'APIs, , Microservicios',
    );
    await user.click(form.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(corrections).toHaveLength(1));
    expect(corrections[0]).toEqual({
      roleCategory: 'backend',
      seniority: 'semi-senior',
      workMode: 'hybrid',
      country: 'ES',
      yearsOfExperience: 5,
      keywords: ['APIs', 'Microservicios'],
      requirements: [
        { id: 'r1', label: 'Node.js', kind: 'TOOL', importance: 'REQUIRED' },
        { id: 'r2', label: 'Postgres', kind: 'TOOL', importance: 'NICE_TO_HAVE' },
        { label: 'Inglés avanzado', kind: 'LANGUAGE', importance: 'REQUIRED' },
      ],
    });

    // Back to the read view, with the corrections.
    expect(await screen.findByText('Inglés avanzado')).toBeInTheDocument();
    expect(screen.queryByText('FooBarDB')).not.toBeInTheDocument();
    expect(screen.getByText('Semi senior')).toBeInTheDocument();
    expect(screen.getByText(/Corregido por vos el/)).toBeInTheDocument();
  });

  it('checks the fields before saving', async () => {
    const { user } = await card();
    const form = await startEditing(user);

    await user.clear(form.getByRole('textbox', { name: 'Requisito 1' }));
    await user.clear(form.getByRole('textbox', { name: 'País' }));
    await user.type(form.getByRole('textbox', { name: 'País' }), 'A1');
    await user.clear(form.getByRole('textbox', { name: 'Experiencia pedida' }));
    await user.type(form.getByRole('textbox', { name: 'Experiencia pedida' }), '99');
    await user.click(form.getByRole('button', { name: 'Guardar' }));

    expect(await form.findByText('Este campo es obligatorio.')).toBeInTheDocument();
    expect(form.getByText('Usá el código de 2 letras del país (p. ej. AR).')).toBeInTheDocument();
    expect(form.getByText('Un número entero de 0 a 40.')).toBeInTheDocument();
    expect(corrections).toHaveLength(0);
  });

  it('cancels without saving', async () => {
    const { user } = await card();
    const form = await startEditing(user);
    await user.click(form.getByRole('button', { name: 'Quitar «Node.js»' }));
    await user.click(form.getByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByText('Node.js')).toBeInTheDocument();
    expect(corrections).toHaveLength(0);
  });

  it('shows the error when saving fails', async () => {
    apiServer.use(
      http.patch(api(`/job-postings/${ID}/analysis`), () =>
        apiError(409, 'CONFLICT', 'The job posting is being analyzed.'),
      ),
    );
    const { user } = await card();
    const form = await startEditing(user);
    await user.click(form.getByRole('button', { name: 'Guardar' }));

    expect(await form.findByText(/The job posting is being analyzed/)).toBeInTheDocument();
  });

  it('asks before analyzing again over corrections', async () => {
    analysis = { ...ANALYSIS, editedAt: '2026-11-17T13:00:00.000Z' };
    const { user } = await card();
    await user.click(await screen.findByRole('button', { name: 'Volver a analizar' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/reemplaza al actual/)).toBeInTheDocument();
    expect(analyzeCalls).toBe(0);
    await user.click(within(dialog).getByRole('button', { name: 'Volver a analizar' }));
    await waitFor(() => expect(analyzeCalls).toBe(1));
  });

  it('analyzes again at once when nothing was corrected', async () => {
    const { user } = await card();
    await user.click(await screen.findByRole('button', { name: 'Volver a analizar' }));
    await waitFor(() => expect(analyzeCalls).toBe(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('JobAnalysisCard tailoring', () => {
  it('starts a tailoring session for the job description and opens its match', async () => {
    const started: unknown[] = [];
    apiServer.use(
      http.post(api('/tailoring-sessions'), async ({ request }) => {
        started.push(await request.json());
        return HttpResponse.json(
          {
            session: {
              id: 'session-9',
              jobPostingId: ID,
              languages: ['en'],
              pageBudget: 1,
              templateId: 'classic',
              status: 'ANALYZING',
              failedStep: null,
              regeneration: null,
              match: null,
              createdAt: '2026-11-17T12:00:00.000Z',
              updatedAt: '2026-11-17T12:00:00.000Z',
            },
            job: { ...JOB, type: 'tailoring-match', status: 'PENDING', attempts: 0 },
          },
          { status: 201 },
        );
      }),
    );
    const { user } = await renderScreen(
      <Routes>
        <Route path="/" element={<JobAnalysisCard jobPostingId={ID} />} />
        <Route path="/tailoring/:id" element={<p>match page</p>} />
      </Routes>,
    );

    await user.click(await screen.findByRole('button', { name: 'Adaptar mi CV' }));
    expect(await screen.findByText('match page')).toBeVisible();
    expect(started).toEqual([{ jobPostingId: ID }]);
  });

  it('shows why a session could not start', async () => {
    apiServer.use(
      http.post(api('/tailoring-sessions'), () =>
        apiError(409, 'CONFLICT', 'The job description is being analyzed.'),
      ),
    );
    const { user } = await card();
    await user.click(await screen.findByRole('button', { name: 'Adaptar mi CV' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The job description is being analyzed.',
    );
  });
});
