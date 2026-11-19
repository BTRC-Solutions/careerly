// @vitest-environment jsdom
import type { Application, ApplicationSummary, ResumeVersion } from '@careerly/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, apiServer, setupApiServer } from '../../../test-support/api-server';
import { renderScreen } from '../../../test-support/render';
import { ApplicationCard } from '../components/ApplicationCard';
import { today } from '../lib/dates';
import { ApplicationPage } from './ApplicationPage';
import { ApplicationsPage } from './ApplicationsPage';

/*
 * Job applications (roadmap 7.3, RF-APP-01, RF-APP-02, RF-APP-08) against a mocked API: creating one from a job
 * description or a finalized session, recording what was sent, and opening exactly the PDF that was sent.
 */

setupApiServer();

const NOW = '2026-11-19T12:00:00.000Z';
const version = (id: string, sessionId: string, language: 'es' | 'en'): ResumeVersion => ({
  id,
  sessionId,
  language,
  templateId: 'classic',
  templateName: 'Clásica',
  templateVersion: 1,
  pageCount: 1,
  pageBudget: 1,
  contentHash: 'a'.repeat(64),
  fileName: `Ana García - Backend Engineer - Acme (${language.toUpperCase()}).pdf`,
  createdAt: NOW,
});
// The newest session first, as the API lists them.
const NEW_ES = version('v-new-es', 'session-new', 'es');
const NEW_EN = version('v-new-en', 'session-new', 'en');
const OLD_EN = version('v-old-en', 'session-old', 'en');

const APPLICATION: Application = {
  id: 'app-1',
  jobPostingId: 'posting-1',
  status: 'APPLIED',
  ghostedFrom: null,
  appliedAt: '2026-11-18',
  sentWithoutCareerlyCv: false,
  sentResumes: [
    {
      resumeVersionId: NEW_ES.id,
      sessionId: NEW_ES.sessionId,
      language: 'es',
      fileName: NEW_ES.fileName,
      sentAt: '2026-11-18',
    },
  ],
  createdAt: NOW,
  updatedAt: NOW,
};

let existing: Application | null;
let created: unknown[];
let sends: unknown[];
let pdfs: string[];

beforeEach(() => {
  existing = null;
  created = [];
  sends = [];
  pdfs = [];
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:pdf'), revokeObjectURL: vi.fn() });
  apiServer.use(
    http.get(api('/applications'), ({ request }) => {
      const jobPostingId = new URL(request.url).searchParams.get('jobPostingId');
      const list: ApplicationSummary[] = existing
        ? [{ ...existing, title: 'Backend Engineer', company: 'Acme' }]
        : [];
      return HttpResponse.json({
        applications: jobPostingId ? list.filter((a) => a.jobPostingId === jobPostingId) : list,
      });
    }),
    http.get(api('/applications/sendable-resumes'), () =>
      HttpResponse.json({ versions: [NEW_ES, NEW_EN, OLD_EN] }),
    ),
    http.post(api('/applications'), async ({ request }) => {
      const body = (await request.json()) as { sent?: object };
      created.push(body);
      existing = {
        ...APPLICATION,
        ...(body.sent ? {} : { status: 'SAVED', appliedAt: null, sentResumes: [] }),
      };
      return HttpResponse.json(existing, { status: 201 });
    }),
    http.get(api('/applications/app-1'), () => HttpResponse.json(existing)),
    http.post(api('/applications/app-1/sent-resumes'), async ({ request }) => {
      sends.push(await request.json());
      return HttpResponse.json(existing);
    }),
    http.get(api('/job-postings/posting-1'), () =>
      HttpResponse.json({
        id: 'posting-1',
        title: 'Backend Engineer',
        company: 'Acme',
        url: null,
        location: null,
        workMode: null,
        salary: null,
        text: 'JD',
        createdAt: NOW,
        updatedAt: NOW,
      }),
    ),
    http.get(api('/resume-versions/:id/pdf'), ({ params }) => {
      pdfs.push(String(params.id));
      return new HttpResponse(new Uint8Array([37, 80, 68, 70]), {
        headers: { 'Content-Type': 'application/pdf' },
      });
    }),
  );
});

const renderCard = (sessionId?: string) =>
  renderScreen(
    <Routes>
      <Route
        path="/"
        element={<ApplicationCard jobPostingId="posting-1" sessionId={sessionId} />}
      />
      <Route path="/applications/:id" element={<ApplicationPage />} />
    </Routes>,
  );

describe('creating an application', () => {
  it('from a finalized session, with its CVs checked and the day it was sent', async () => {
    const { user } = await renderCard('session-old');
    expect(
      await screen.findByText('Todavía no creaste la postulación para esta oferta.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Crear postulación' }));

    const dialog = await screen.findByRole('dialog', { name: 'Crear postulación' });
    expect(within(dialog).getByRole('radio', { name: 'Sí, ya la envié' })).toBeChecked();
    // Only the CV of the session it comes from is checked.
    const boxes = await within(dialog).findAllByRole('checkbox', { name: /^CV en/ });
    expect(boxes.map((box) => (box as HTMLInputElement).checked)).toEqual([false, false, true]);
    expect(within(dialog).getByLabelText('Fecha de envío')).toHaveValue(today());
    await user.clear(within(dialog).getByLabelText('Fecha de envío'));
    await user.type(within(dialog).getByLabelText('Fecha de envío'), '2026-11-18');
    await user.click(within(dialog).getByRole('button', { name: 'Crear postulación' }));

    // It opens the new application.
    expect(await screen.findByRole('heading', { name: 'Backend Engineer' })).toBeVisible();
    expect(created).toEqual([
      {
        jobPostingId: 'posting-1',
        sent: { resumeVersionIds: [OLD_EN.id], sentAt: '2026-11-18' },
      },
    ]);
  });

  it('from a job description, checking the newest CVs, or saved to send later', async () => {
    const { user } = await renderCard();
    await user.click(await screen.findByRole('button', { name: 'Crear postulación' }));
    const dialog = await screen.findByRole('dialog', { name: 'Crear postulación' });
    const boxes = await within(dialog).findAllByRole('checkbox', { name: /^CV en/ });
    expect(boxes.map((box) => (box as HTMLInputElement).checked)).toEqual([true, true, false]);

    // Without any CV it cannot be marked as sent, unless it went without a Careerly CV.
    for (const box of boxes.slice(0, 2)) await user.click(box);
    expect(within(dialog).getByRole('button', { name: 'Crear postulación' })).toBeDisabled();
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'La envié sin un CV hecho con Careerly' }),
    );
    expect(within(dialog).getByRole('button', { name: 'Crear postulación' })).toBeEnabled();

    // "Not yet" saves it.
    await user.click(within(dialog).getByRole('radio', { name: /Todavía no/ }));
    expect(within(dialog).queryByText('¿Qué CVs enviaste?')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Crear postulación' }));
    expect(
      await screen.findByText('Cuando la envíes, registrá acá qué CVs mandaste.'),
    ).toBeVisible();
    expect(created).toEqual([{ jobPostingId: 'posting-1' }]);
  });

  it('links to the application the job description already has', async () => {
    existing = APPLICATION;
    await renderCard('session-new');
    expect(await screen.findByRole('link', { name: 'Ver postulación' })).toHaveAttribute(
      'href',
      '/applications/app-1',
    );
    expect(screen.getByText('Enviada')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Crear postulación' })).not.toBeInTheDocument();
  });
});

describe('an application', () => {
  const renderDetail = () =>
    renderScreen(
      <Routes>
        <Route path="/applications/:id" element={<ApplicationPage />} />
      </Routes>,
      { path: '/applications/app-1' },
    );

  it('opens and downloads exactly the PDF that was sent (RF-APP-08)', async () => {
    existing = APPLICATION;
    const { user } = await renderDetail();

    expect(await screen.findByRole('heading', { name: 'Backend Engineer' })).toBeVisible();
    const sent = screen.getByRole('listitem');
    expect(within(sent).getByText('CV en español')).toBeVisible();
    expect(
      within(sent).getByText(/Enviado el .* · Ana García - Backend Engineer - Acme \(ES\)\.pdf/),
    ).toBeVisible();

    await user.click(within(sent).getByRole('button', { name: 'Ver' }));
    expect(await screen.findByTitle('CV enviado en español')).toBeInTheDocument();
    expect(pdfs).toEqual([NEW_ES.id]);

    const saved: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });
    await user.click(within(sent).getByRole('button', { name: 'Descargar PDF' }));
    await waitFor(() => expect(saved).toEqual([NEW_ES.fileName]));
    expect(pdfs.at(-1)).toBe(NEW_ES.id);
    click.mockRestore();
  });

  it('adds a CV sent later, offering only the ones not sent yet', async () => {
    existing = APPLICATION;
    const { user } = await renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Agregar CV enviado' }));

    const dialog = await screen.findByRole('dialog', { name: 'Agregar CV enviado' });
    const boxes = await within(dialog).findAllByRole('checkbox', { name: /^CV en/ });
    expect(boxes).toHaveLength(2);
    // Already sent once: no "without a Careerly CV" here.
    expect(
      within(dialog).queryByText('La envié sin un CV hecho con Careerly'),
    ).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Agregar CV enviado' }));

    await waitFor(() =>
      expect(sends).toEqual([{ resumeVersionIds: [NEW_EN.id], sentAt: today() }]),
    );
  });
});

describe('the applications list', () => {
  it('shows each application with its job and state, or how to create one', async () => {
    await renderScreen(<ApplicationsPage />);
    expect(await screen.findByText('Todavía no tenés postulaciones')).toBeVisible();
  });

  it('lists the applications', async () => {
    existing = APPLICATION;
    await renderScreen(<ApplicationsPage />);
    const row = await screen.findByRole('link', { name: /Backend Engineer/ });
    expect(row).toHaveAttribute('href', '/applications/app-1');
    expect(within(row).getByText('Enviada')).toBeVisible();
    expect(within(row).getByText(/Acme · Enviada el/)).toBeVisible();
  });
});
