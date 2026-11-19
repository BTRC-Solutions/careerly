// @vitest-environment jsdom
import type { JobView, Profile, TailoredResume, TailoringSessionView } from '@careerly/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, apiServer, setupApiServer } from '../../../test-support/api-server';
import { renderScreen } from '../../../test-support/render';
import { MatchSummaryPage } from './MatchSummaryPage';

/*
 * Generating the CVs and reviewing them (roadmaps 6.3 and 6.6, RF-TAIL-10, RF-TAIL-12) against a mocked API. The
 * PDF itself (Chromium's viewer) cannot be seen here: the tests check that the preview is requested again after
 * each change.
 */

setupApiServer();

const ID = 'session-1';
const NOW = '2026-11-18T12:00:00.000Z';
const provenance = {
  origin: 'MANUAL',
  originSessionId: null,
  createdAt: NOW,
  updatedAt: NOW,
} as const;

const PROFILE = {
  personalInfo: {
    firstNames: 'Ana',
    lastNames: 'García',
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
      tools: [],
      achievements: [
        {
          id: 'ach-1',
          text: 'Designed the public REST API used by 40 partners.',
          metrics: null,
          tools: [],
          ...provenance,
        },
      ],
      ...provenance,
    },
  ],
  projects: [],
  education: [],
  certifications: [],
  languages: [],
} satisfies Profile;

const job = (type: string, status: JobView['status'], step: string | null = null): JobView => ({
  id: `job-${type}`,
  type,
  status,
  attempts: 1,
  maxAttempts: 3,
  progress: step ? { step, done: 0, total: 1 } : null,
  lastError: null,
  createdAt: NOW,
  updatedAt: NOW,
  finishedAt: status === 'SUCCEEDED' ? NOW : null,
});

const session = (
  status: TailoringSessionView['session']['status'],
  gaps: boolean,
): TailoringSessionView['session'] => ({
  id: ID,
  jobPostingId: 'posting-1',
  languages: ['en'],
  pageBudget: 1,
  templateId: 'classic',
  status,
  failedStep: null,
  regeneration: null,
  createdAt: NOW,
  updatedAt: NOW,
  match: {
    requirements: [
      {
        requirementId: 'r1',
        label: 'Node.js',
        kind: 'TOOL',
        importance: 'REQUIRED',
        tool: { id: 't-node', name: 'Node.js' },
        status: gaps ? 'PARTIAL' : 'COVERED',
        method: 'TOOLS',
        evidence: [{ kind: 'POSITION', id: 'pos-1' }],
      },
    ],
    promptVersion: null,
    model: null,
    matchedAt: NOW,
  },
});

const bullet = (id: string, text: string, inclusion: 'AUTO' | 'EXCLUDED' = 'AUTO') => ({
  id,
  text,
  sourceIds: ['ach-1'],
  score: null,
  editedByUser: false,
  inclusion,
});

const RESUME: TailoredResume = {
  sessionId: ID,
  language: 'en',
  promptVersion: 'resume-writing.v1',
  model: 'gemini-test',
  generatedAt: NOW,
  data: {
    summary: { text: 'Backend engineer of public APIs.', sourceIds: ['pos-1'] },
    experiences: [
      {
        kind: 'POSITION',
        sourceId: 'pos-1',
        bullets: [
          bullet('b1', 'Designed the public REST API used by 40 partners'),
          bullet('b2', 'Documented the API for partners'),
        ],
      },
    ],
    toolIds: [],
    guard: {
      rewritten: 1,
      dropped: [
        {
          kind: 'BULLET',
          experienceId: 'pos-1',
          text: 'Ran the API on Kubernetes',
          reasons: ['TOOL_NOT_IN_SOURCES'],
        },
      ],
    },
    fit: {
      selection: { positions: [{ id: 'pos-1', bulletIds: ['b1'] }], projects: [] },
      pageCount: 1,
      fits: true,
      pageBudget: 1,
      log: [
        {
          owner: { type: 'position', id: 'pos-1' },
          bulletId: 'b2',
          action: 'LEFT_OUT',
          reason: 'OVER_BUDGET',
        },
      ],
    },
  },
};

let view: TailoringSessionView;
let resume: TailoredResume;
let calls: string[];
let edits: unknown[];
let previews: number;
let regenerations: unknown[];

beforeEach(() => {
  calls = [];
  edits = [];
  previews = 0;
  regenerations = [];
  resume = RESUME;
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() });
  apiServer.use(
    http.get(api(`/tailoring-sessions/${ID}`), () => HttpResponse.json(view)),
    http.get(api(`/tailoring-sessions/${ID}/gaps`), () => HttpResponse.json({ questions: [] })),
    http.post(api(`/tailoring-sessions/${ID}/generate`), () => {
      calls.push('generate');
      view = {
        session: session('GENERATING', true),
        job: job('tailoring-generate', 'RUNNING', 'writing'),
      };
      return HttpResponse.json(view);
    }),
    http.post(api(`/tailoring-sessions/${ID}/regenerate`), async ({ request }) => {
      regenerations.push(await request.json());
      view = {
        session: session('GENERATING', false),
        job: job('tailoring-generate', 'RUNNING', 'writing'),
      };
      return HttpResponse.json(view);
    }),
    http.get(api(`/tailoring-sessions/${ID}/resumes`), () =>
      HttpResponse.json({ resumes: [resume] }),
    ),
    http.get(api(`/tailoring-sessions/${ID}/resumes/en/preview`), () => {
      previews += 1;
      return new HttpResponse(new Uint8Array([37, 80, 68, 70]), {
        headers: { 'Content-Type': 'application/pdf' },
      });
    }),
    http.patch(api(`/tailoring-sessions/${ID}/resumes/en`), async ({ request }) => {
      const edit = (await request.json()) as { op: string; bulletId: string; text?: string };
      edits.push(edit);
      const bullets = resume.data.experiences[0]!.bullets.map((b) =>
        b.id === edit.bulletId && edit.op === 'EDIT_BULLET'
          ? { ...b, text: edit.text!, editedByUser: true }
          : b.id === edit.bulletId && edit.op === 'SET_INCLUSION'
            ? { ...b, inclusion: 'EXCLUDED' as const }
            : b,
      );
      resume = {
        ...resume,
        data: { ...resume.data, experiences: [{ ...resume.data.experiences[0]!, bullets }] },
      };
      return HttpResponse.json(resume);
    }),
    http.get(api('/profile'), () => HttpResponse.json(PROFILE)),
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
        createdAt: NOW,
        updatedAt: NOW,
      }),
    ),
  );
});

const render = () =>
  renderScreen(
    <Routes>
      <Route path="/tailoring/:id" element={<MatchSummaryPage />} />
    </Routes>,
    { path: `/tailoring/${ID}`, language: 'es' },
  );

describe('generating and reviewing the CV', () => {
  it('generates the CV from the gap questions, with what is still not covered', async () => {
    view = { session: session('AWAITING_ANSWERS', true), job: job('tailoring-match', 'SUCCEEDED') };
    await render();

    expect(await screen.findByText(/Queda 1 requisito sin cubrir del todo/)).toBeVisible();
    expect(screen.getByText('En inglés · hasta 1 página')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Generar CV' }));

    expect(await screen.findByText('Escribiendo el CV con la IA…')).toBeVisible();
    expect(calls).toEqual(['generate']);
  });

  it('shows each bullet with its state and source, next to the preview', async () => {
    view = { session: session('REVIEW', false), job: job('tailoring-generate', 'SUCCEEDED') };
    await render();

    expect(await screen.findByRole('heading', { name: 'Revisión del CV' })).toBeVisible();
    expect(await screen.findByText('Ocupa 1 página, dentro del límite de 1.')).toBeVisible();
    expect(screen.getByText('1 bullet quedó afuera para que el CV entre.')).toBeVisible();
    expect(screen.getByText('Backend engineer of public APIs.')).toBeVisible();

    const card = (await screen.findByRole('heading', { name: 'Backend Engineer · Acme' })).closest(
      'section, div',
    )!.parentElement!;
    const [first, second] = within(card)
      .getAllByRole('listitem')
      .filter((li) => li.querySelector('select'));
    expect(within(first!).getByText('En el CV')).toBeVisible();
    expect(within(second!).getByText('Afuera: no entra en las páginas')).toBeVisible();
    expect(
      within(first!).getByRole('link', {
        name: 'Designed the public REST API used by 40 partners.',
      }),
    ).toHaveAttribute('href', '/profile/experience/pos-1');

    expect(await screen.findByTitle('Vista previa del CV en inglés')).toBeInTheDocument();
    expect(previews).toBe(1);
    expect(screen.getByText(/corrigió 1 y dejó afuera 1 texto/)).toBeInTheDocument();
  });

  it('edits a bullet and excludes another, reloading the preview after each change', async () => {
    view = { session: session('REVIEW', false), job: job('tailoring-generate', 'SUCCEEDED') };
    await render();
    await screen.findByTitle('Vista previa del CV en inglés');

    const rows = () => screen.getAllByRole('listitem').filter((li) => li.querySelector('select'));
    await userEvent.click(within(rows()[0]!).getByRole('button', { name: 'Editar' }));
    const editor = screen.getByRole('textbox', { name: 'Texto del bullet' });
    await userEvent.clear(editor);
    await userEvent.type(editor, 'Designed the partner API');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Designed the partner API')).toBeVisible();
    expect(within(rows()[0]!).getByText('Editado por vos')).toBeVisible();
    await waitFor(() => expect(previews).toBe(2));

    await userEvent.selectOptions(
      within(rows()[1]!).getByRole('combobox', { name: 'Inclusión en el CV' }),
      'EXCLUDED',
    );
    expect(await within(rows()[1]!).findByText('Excluido por vos')).toBeVisible();
    await waitFor(() => expect(previews).toBe(3));

    expect(edits).toEqual([
      { op: 'EDIT_BULLET', bulletId: 'b1', text: 'Designed the partner API' },
      { op: 'SET_INCLUSION', bulletId: 'b2', inclusion: 'EXCLUDED' },
    ]);
    // The first bullet cannot go up; the last one cannot go down.
    expect(within(rows()[0]!).getByRole('button', { name: 'Subir' })).toBeDisabled();
    expect(within(rows()[1]!).getByRole('button', { name: 'Bajar' })).toBeDisabled();
  });

  it('regenerates one section with indications (RF-TAIL-13)', async () => {
    view = { session: session('REVIEW', false), job: job('tailoring-generate', 'SUCCEEDED') };
    await render();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Regenerar Backend Engineer · Acme' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Regenerar Backend Engineer · Acme' });
    expect(within(dialog).getByText(/Lo que editaste y el resto del CV no cambian/)).toBeVisible();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Indicaciones (opcional)' }),
      'Más foco en documentación',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Regenerar' }));

    expect(await screen.findByText('Escribiendo el CV con la IA…')).toBeVisible();
    expect(regenerations).toEqual([
      {
        scope: { kind: 'EXPERIENCE', experienceId: 'pos-1' },
        instructions: 'Más foco en documentación',
        languages: ['en'],
      },
    ]);
  });
});
