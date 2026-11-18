// @vitest-environment jsdom
import type {
  GapAnswer,
  GapQuestion,
  Profile,
  TailoringSession,
  TailoringSessionView,
} from '@careerly/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, apiServer, setupApiServer } from '../../../test-support/api-server';
import { renderScreen } from '../../../test-support/render';
import { GapQuestionsCard } from './GapQuestionsCard';

/* Answering the gap questions (roadmap 5.5, RF-GAP-01) against a mocked API. */

setupApiServer();

const ID = 'session-1';
const AT = '2026-11-18T12:00:00.000Z';

const provenance = {
  origin: 'MANUAL',
  originSessionId: null,
  createdAt: AT,
  updatedAt: AT,
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
      achievements: [],
      ...provenance,
    },
  ],
  projects: [
    {
      id: 'proj-1',
      name: 'Homelab',
      kind: 'PERSONAL',
      role: null,
      url: null,
      startDate: null,
      endDate: null,
      description: null,
      tools: [],
      achievements: [],
      ...provenance,
    },
  ],
  education: [],
  certifications: [],
  languages: [],
} satisfies Profile;

const question = (requirementId: string, changes: Partial<GapQuestion>): GapQuestion => ({
  requirementId,
  label: requirementId,
  kind: 'TOOL',
  importance: 'REQUIRED',
  tool: null,
  gap: 'MISSING',
  relatedEvidence: [],
  answer: null,
  answeredAt: null,
  created: [],
  ...changes,
});

const QUESTIONS: GapQuestion[] = [
  question('r-pg', { label: 'Postgres', tool: { id: 't-pg', name: 'PostgreSQL' } }),
  question('r-docker', {
    label: 'Docker',
    tool: { id: 't-docker', name: 'Docker' },
    gap: 'PARTIAL',
    relatedEvidence: [{ kind: 'POSITION', id: 'pos-1' }],
  }),
  question('r-lead', { label: 'Liderar equipos', kind: 'SKILL', importance: 'NICE_TO_HAVE' }),
];

const SESSION: TailoringSession = {
  id: ID,
  jobPostingId: 'posting-1',
  languages: ['es'],
  pageBudget: 1,
  templateId: 'classic',
  status: 'AWAITING_ANSWERS',
  failedStep: null,
  match: null,
  createdAt: AT,
  updatedAt: AT,
};

let questions: GapQuestion[];
let answers: { requirementId: string; body: GapAnswer }[];
let asked: number;

beforeEach(() => {
  questions = QUESTIONS;
  answers = [];
  asked = 0;
  apiServer.use(
    http.get(api('/profile'), () => HttpResponse.json(PROFILE)),
    http.get(api(`/tailoring-sessions/${ID}/gaps`), () => HttpResponse.json({ questions })),
    http.get(api(`/tailoring-sessions/${ID}`), () =>
      HttpResponse.json({ session: SESSION, job: null } satisfies TailoringSessionView),
    ),
    http.post(api(`/tailoring-sessions/${ID}/ask-gaps`), () => {
      asked += 1;
      return HttpResponse.json({ questions });
    }),
    http.put(api(`/tailoring-sessions/${ID}/gaps/:requirementId`), async ({ request, params }) => {
      const body = (await request.json()) as GapAnswer;
      const requirementId = String(params.requirementId);
      answers.push({ requirementId, body });
      questions = questions.map((q) =>
        q.requirementId === requirementId
          ? {
              ...q,
              answer: body,
              answeredAt: AT,
              created:
                body.answer === 'USED_AT_WORK' ? [{ kind: 'ACHIEVEMENT', id: 'new-ach' }] : [],
            }
          : q,
      );
      return HttpResponse.json({ questions });
    }),
  );
});

const render = (session: TailoringSession = SESSION) =>
  renderScreen(<GapQuestionsCard session={session} />);

const item = async (name: string | RegExp) =>
  within((await screen.findByRole('heading', { name })).closest('li')!);

describe('GapQuestionsCard', () => {
  it('offers to start answering once the match has gaps', async () => {
    const { user } = await render({
      ...SESSION,
      status: 'MATCHED',
      match: {
        requirements: [
          {
            requirementId: 'r-pg',
            label: 'Postgres',
            kind: 'TOOL',
            importance: 'REQUIRED',
            tool: null,
            status: 'MISSING',
            method: 'TOOLS',
            evidence: [],
          },
        ],
        promptVersion: null,
        model: null,
        matchedAt: AT,
      },
    });
    expect(screen.getByText(/Hay 1 requisito que tu perfil no muestra/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Responder' }));
    await waitFor(() => expect(asked).toBe(1));
  });

  it('words the questions from templates and shows what partial ones already have', async () => {
    await render();

    expect(await screen.findByRole('heading', { name: '¿Usaste PostgreSQL?' })).toBeVisible();
    expect(
      screen.getByRole('heading', { name: '¿Tenés experiencia en «Liderar equipos»?' }),
    ).toBeVisible();
    const docker = await item('¿Qué hiciste con Docker?');
    expect(docker.getByText(/Docker figura en tu perfil, pero ningún logro/)).toBeVisible();
    expect(await docker.findByText('Backend Engineer · Acme')).toBeVisible();
    expect(screen.getByText('0 de 3 respondidas')).toBeVisible();
  });

  it('answers in any order: at work, in a new project, or skipped', async () => {
    const { user } = await render();

    const lead = await item(/Liderar equipos/);
    await user.click(lead.getByRole('button', { name: 'Saltear' }));
    await waitFor(() => expect(answers).toHaveLength(1));
    expect(answers[0]).toEqual({ requirementId: 'r-lead', body: { answer: 'SKIPPED' } });

    const pg = await item('¿Usaste PostgreSQL?');
    await user.click(pg.getByRole('radio', { name: 'Sí, en un trabajo' }));
    await user.click(pg.getByRole('checkbox', { name: 'Backend Engineer · Acme' }));
    await user.type(
      pg.getByRole('textbox', { name: '¿Qué hiciste?' }),
      'Tuned the billing queries.',
    );
    await user.click(pg.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(answers).toHaveLength(2));
    expect(answers[1]!.body).toEqual({
      answer: 'USED_AT_WORK',
      positionIds: ['pos-1'],
      detail: 'Tuned the billing queries.',
    });

    const docker = await item('¿Qué hiciste con Docker?');
    await user.click(docker.getByRole('radio', { name: 'Sí, en un proyecto o curso' }));
    await user.selectOptions(
      docker.getByRole('combobox', { name: 'Proyecto o curso' }),
      'Uno nuevo…',
    );
    await user.type(docker.getByRole('textbox', { name: 'Nombre' }), 'Curso de Docker');
    await user.selectOptions(docker.getByRole('combobox', { name: 'Tipo' }), 'Curso');
    await user.type(
      docker.getByRole('textbox', { name: '¿Qué hiciste?' }),
      'Containerized an app.',
    );
    await user.click(docker.getByRole('checkbox', { name: 'Incluirlo en este CV' }));
    await user.click(docker.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(answers).toHaveLength(3));
    expect(answers[2]!.body).toEqual({
      answer: 'USED_ELSEWHERE',
      project: { name: 'Curso de Docker', kind: 'COURSE' },
      detail: 'Containerized an app.',
      includeInResume: false,
    });

    expect(await screen.findByText('3 de 3 respondidas')).toBeVisible();
    // Answered questions show the answer, and can change it.
    expect(await pg.findByText('Tuned the billing queries.')).toBeVisible();
    expect(pg.getByRole('button', { name: 'Cambiar' })).toBeVisible();
    expect(pg.getByText(/Se agregó a tu perfil maestro/)).toBeVisible();
  });

  it('asks for what is missing before saving an affirmative answer', async () => {
    const { user } = await render();
    const pg = await item('¿Usaste PostgreSQL?');
    await user.click(pg.getByRole('radio', { name: 'Sí, en un trabajo' }));
    await user.click(pg.getByRole('button', { name: 'Guardar' }));
    expect(pg.getByText('Contá en 1 o 2 líneas qué hiciste.')).toBeVisible();

    await user.type(pg.getByRole('textbox', { name: '¿Qué hiciste?' }), 'Something.');
    await user.click(pg.getByRole('button', { name: 'Guardar' }));
    expect(pg.getByText('Elegí al menos una experiencia.')).toBeVisible();
    expect(answers).toHaveLength(0);
  });

  it('saves a "no" without asking anything else', async () => {
    const { user } = await render();
    const pg = await item('¿Usaste PostgreSQL?');
    await user.click(pg.getByRole('radio', { name: 'No' }));
    await user.click(pg.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(answers).toEqual([{ requirementId: 'r-pg', body: { answer: 'NOT_USED' } }]),
    );
  });
});
