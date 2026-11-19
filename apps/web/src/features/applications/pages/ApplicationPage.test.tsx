// @vitest-environment jsdom
import type {
  Application,
  ApplicationEvent,
  ApplicationSummary,
  Contact,
  ResumeVersion,
} from '@careerly/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, apiServer, setupApiServer } from '../../../test-support/api-server';
import { renderScreen } from '../../../test-support/render';
import { ApplicationCard } from '../components/ApplicationCard';
import { today } from '../lib/dates';
import { ApplicationPage } from './ApplicationPage';

/*
 * Job applications (roadmap 7.3, RF-APP-01, RF-APP-02, RF-APP-08) against a mocked API: creating one from a job
 * description or a finalized session, recording what was sent, opening exactly the PDF that was sent, and the
 * timeline (roadmap 7.5, RF-APP-04), and the contacts and extra data (roadmap 7.6, RF-APP-05, RF-APP-07).
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
  channel: null,
  priority: null,
  salaryExpected: null,
  salaryOffered: null,
  createdAt: NOW,
  updatedAt: NOW,
};

let existing: Application | null;
let created: unknown[];
let sends: unknown[];
let pdfs: string[];
let events: ApplicationEvent[];
let added: unknown[];
let contacts: Contact[];
let patches: unknown[];
let contactCalls: string[];

beforeEach(() => {
  existing = null;
  created = [];
  sends = [];
  pdfs = [];
  events = [];
  added = [];
  contacts = [];
  patches = [];
  contactCalls = [];
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
    http.get(api('/applications/app-1/events'), () => HttpResponse.json({ events })),
    http.patch(api('/applications/app-1'), async ({ request }) => {
      const body = (await request.json()) as Partial<Application>;
      patches.push(body);
      existing = { ...existing!, ...body };
      return HttpResponse.json(existing);
    }),
    http.get(api('/applications/app-1/contacts'), () => HttpResponse.json({ contacts })),
    http.post(api('/applications/app-1/contacts'), async ({ request }) => {
      const body = (await request.json()) as Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>;
      contactCalls.push(`POST ${JSON.stringify(body)}`);
      const contact = { ...body, id: `c-${contacts.length + 1}`, createdAt: NOW, updatedAt: NOW };
      contacts = [...contacts, contact];
      return HttpResponse.json(contact, { status: 201 });
    }),
    http.put(api('/applications/app-1/contacts/:contactId'), async ({ params, request }) => {
      const body = (await request.json()) as Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>;
      contactCalls.push(`PUT ${String(params.contactId)} ${JSON.stringify(body)}`);
      contacts = contacts.map((c) => (c.id === params.contactId ? { ...c, ...body } : c));
      return HttpResponse.json(contacts.find((c) => c.id === params.contactId));
    }),
    http.delete(api('/applications/app-1/contacts/:contactId'), ({ params }) => {
      contactCalls.push(`DELETE ${String(params.contactId)}`);
      contacts = contacts.filter((c) => c.id !== params.contactId);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(api('/applications/app-1/events'), async ({ request }) => {
      const body = (await request.json()) as { type: 'NOTE'; text: string };
      added.push(body);
      const event: ApplicationEvent = {
        ...body,
        id: `e-${added.length}`,
        occurredAt: NOW,
        createdAt: NOW,
      };
      events = [...events, event];
      return HttpResponse.json(event, { status: 201 });
    }),
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

describe('the timeline (roadmap 7.5, RF-APP-04)', () => {
  const at = (occurredAt: string) => ({ occurredAt, createdAt: occurredAt });
  const renderDetail = () =>
    renderScreen(
      <Routes>
        <Route path="/applications/:id" element={<ApplicationPage />} />
      </Routes>,
      { path: '/applications/app-1' },
    );

  it('shows what happened, newest first, without a way to change it', async () => {
    existing = APPLICATION;
    events = [
      {
        id: 'e1',
        type: 'STATUS_CHANGE',
        from: null,
        to: 'SAVED',
        backward: false,
        reopened: false,
        ...at('2026-11-10T12:00:00.000Z'),
      },
      {
        id: 'e2',
        type: 'STATUS_CHANGE',
        from: 'SAVED',
        to: 'APPLIED',
        backward: false,
        reopened: false,
        ...at('2026-11-11T12:00:00.000Z'),
      },
      {
        id: 'e3',
        type: 'MESSAGE',
        channel: 'LINKEDIN',
        from: 'Laura',
        text: '¿Hablamos el lunes?',
        ...at('2026-11-12T12:00:00.000Z'),
      },
      {
        id: 'e4',
        type: 'STATUS_CHANGE',
        from: 'INTERVIEWING',
        to: 'APPLIED',
        backward: true,
        reopened: false,
        ...at('2026-11-13T12:00:00.000Z'),
      },
      {
        id: 'e5',
        type: 'INTERVIEW',
        kind: 'TECHNICAL',
        interviewers: ['Grace', 'Alan'],
        outcome: 'PENDING',
        ...at('2099-01-15T17:00:00.000Z'),
      },
    ];
    await renderDetail();

    const timeline = await screen.findByRole('list', { name: 'Línea de tiempo' });
    const items = await within(timeline).findAllByRole('listitem');
    expect(items.map((item) => item.querySelector('p')!.textContent)).toEqual([
      'Entrevista: técnica',
      'Volvió de Entrevistas a Enviada (confirmado)',
      'Mensaje por LinkedIn de Laura',
      'Pasó de Guardada a Enviada',
      'Creaste la postulación (Guardada)',
    ]);
    expect(within(items[0]!).getByText('Con Grace, Alan')).toBeVisible();
    expect(within(items[0]!).getByText('Sin resultado')).toBeVisible();
    expect(within(items[0]!).getByText('Próxima')).toBeVisible();
    expect(within(items[2]!).getByText('¿Hablamos el lunes?')).toBeVisible();
    expect(screen.getByText('Lo que se registra acá no se puede editar ni borrar.')).toBeVisible();
    for (const item of items) expect(within(item).queryByRole('button')).not.toBeInTheDocument();
  });

  it('adds a note and an interview, with its interviewers and date', async () => {
    existing = APPLICATION;
    const { user } = await renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Agregar nota' }));
    let dialog = await screen.findByRole('dialog', { name: 'Agregar nota' });
    const save = within(dialog).getByRole('button', { name: 'Guardar' });
    expect(save).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Nota'), 'Hablé con un ex compañero.');
    await user.click(save);
    expect(await screen.findByText('Hablé con un ex compañero.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Registrar entrevista' }));
    dialog = await screen.findByRole('dialog', { name: 'Registrar entrevista' });
    const date = within(dialog).getByLabelText('Fecha y hora');
    await user.clear(date);
    await user.type(date, '2026-11-20T10:30');
    await user.selectOptions(within(dialog).getByLabelText('Tipo'), 'conductual');
    await user.type(within(dialog).getByLabelText('Entrevistadores'), ' Grace Hopper, , Alan ');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(added).toHaveLength(2));
    expect(added).toEqual([
      { type: 'NOTE', text: 'Hablé con un ex compañero.' },
      {
        type: 'INTERVIEW',
        kind: 'BEHAVIORAL',
        outcome: 'PENDING',
        interviewers: ['Grace Hopper', 'Alan'],
        occurredAt: new Date('2026-11-20T10:30').toISOString(),
      },
    ]);
  });
});

describe('contacts and extra data (roadmap 7.6, RF-APP-05, RF-APP-07)', () => {
  const renderDetail = () =>
    renderScreen(
      <Routes>
        <Route path="/applications/:id" element={<ApplicationPage />} />
      </Routes>,
      { path: '/applications/app-1' },
    );

  it('adds, edits and deletes contacts', async () => {
    existing = APPLICATION;
    const { user } = await renderDetail();
    expect(
      await screen.findByText('Todavía no agregaste contactos de esta postulación.'),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Agregar contacto' }));
    let dialog = await screen.findByRole('dialog', { name: 'Agregar contacto' });
    await user.type(within(dialog).getByLabelText('Nombre'), '  Laura Gómez ');
    await user.type(within(dialog).getByLabelText('Email (opcional)'), 'laura@acme.test');
    await user.type(
      within(dialog).getByLabelText('LinkedIn (opcional)'),
      'https://www.linkedin.com/in/laura',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    const list = await screen.findByRole('list', { name: 'Contactos' });
    expect(within(list).getByText('laura@acme.test')).toBeVisible();
    expect(within(list).getByRole('link', { name: 'Ver perfil de LinkedIn' })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/laura',
    );

    await user.click(within(list).getByRole('button', { name: 'Editar a Laura Gómez' }));
    dialog = await screen.findByRole('dialog', { name: 'Editar contacto' });
    await user.selectOptions(within(dialog).getByLabelText('Rol'), 'Hiring manager');
    await user.clear(within(dialog).getByLabelText('Email (opcional)'));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(list).findByText(/Hiring manager/)).toBeVisible();

    await user.click(within(list).getByRole('button', { name: 'Borrar a Laura Gómez' }));
    const confirm = await screen.findByRole('dialog', { name: '¿Borrar a Laura Gómez?' });
    await user.click(within(confirm).getByRole('button', { name: 'Eliminar' }));
    expect(
      await screen.findByText('Todavía no agregaste contactos de esta postulación.'),
    ).toBeVisible();

    expect(contactCalls).toEqual([
      'POST {"name":"Laura Gómez","role":"RECRUITER","email":"laura@acme.test","linkedinUrl":"https://www.linkedin.com/in/laura"}',
      'PUT c-1 {"name":"Laura Gómez","role":"HIRING_MANAGER","email":null,"linkedinUrl":"https://www.linkedin.com/in/laura"}',
      'DELETE c-1',
    ]);
  });

  it('saves the channel, priority and salaries, clearing what is left empty', async () => {
    existing = { ...APPLICATION, salaryOffered: 'USD 3.000' };
    const { user } = await renderDetail();
    await screen.findByRole('heading', { name: 'Datos adicionales' });

    await user.selectOptions(screen.getByLabelText('Canal de postulación'), 'Referido');
    await user.selectOptions(screen.getByLabelText('Prioridad'), 'Alta');
    await user.type(screen.getByLabelText('Salario pretendido'), ' USD 4.000/mes ');
    await user.clear(screen.getByLabelText('Salario ofrecido'));
    await user.click(screen.getByRole('button', { name: 'Guardar datos' }));

    expect(await screen.findByText('Guardado.')).toBeVisible();
    expect(patches).toEqual([
      {
        channel: 'REFERRAL',
        priority: 'HIGH',
        salaryExpected: 'USD 4.000/mes',
        salaryOffered: null,
      },
    ]);
  });
});
