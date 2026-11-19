// @vitest-environment jsdom
import type { Application, ApplicationSummary } from '@careerly/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, apiServer, setupApiServer } from '../../../test-support/api-server';
import { renderScreen } from '../../../test-support/render';
import { ApplicationsPage } from './ApplicationsPage';

/*
 * The applications board and table (roadmap 7.4, RF-APP-03, RF-APP-06) against a mocked API. Dragging needs a
 * real layout, so here cards move with their "Move to…" menu, the keyboard path; the drag itself was checked
 * in the browser.
 */

setupApiServer();

const NOW = '2026-11-19T12:00:00.000Z';
const summary = (
  id: string,
  title: string,
  company: string,
  status: ApplicationSummary['status'],
  appliedAt: string | null,
  ghostedFrom: ApplicationSummary['ghostedFrom'] = null,
): ApplicationSummary => ({
  id,
  jobPostingId: `jp-${id}`,
  title,
  company,
  status,
  ghostedFrom,
  appliedAt,
  createdAt: NOW,
  updatedAt: NOW,
});

let list: ApplicationSummary[];
let moves: { id: string; body: unknown }[];

beforeEach(() => {
  list = [
    summary('a1', 'Data Engineer', 'Acme', 'SAVED', null),
    summary('a2', 'Backend Engineer', 'Globex', 'INTERVIEWING', '2026-11-10'),
    summary('a3', 'Platform Engineer', 'Initech', 'REJECTED', '2026-10-01'),
    summary('a4', 'SRE', 'Acme', 'GHOSTED', '2026-11-02', 'SCREENING'),
  ];
  moves = [];
  apiServer.use(
    http.get(api('/applications'), () => HttpResponse.json({ applications: list })),
    http.post(api('/applications/:id/status'), async ({ params, request }) => {
      const body = (await request.json()) as { to: ApplicationSummary['status'] };
      moves.push({ id: String(params.id), body });
      list = list.map((a) => (a.id === params.id ? { ...a, status: body.to } : a));
      const moved = list.find((a) => a.id === params.id)!;
      const application: Application = {
        ...moved,
        sentWithoutCareerlyCv: false,
        sentResumes: [],
      };
      return HttpResponse.json(application);
    }),
    http.get(api('/applications/sendable-resumes'), () => HttpResponse.json({ versions: [] })),
  );
});

const column = (name: string) => screen.getByRole('region', { name });
const openMenu = async (user: Awaited<ReturnType<typeof renderScreen>>['user'], title: string) => {
  await user.click(await screen.findByRole('button', { name: `Mover «${title}» a…` }));
  return screen.findByRole('menu');
};

describe('the applications board', () => {
  it('shows a column per state, with the closed ones together and collapsed', async () => {
    const { user } = await renderScreen(<ApplicationsPage />);
    expect(await screen.findByRole('link', { name: 'Data Engineer' })).toBeVisible();

    expect(within(column('Guardadas')).getByText('Data Engineer')).toBeVisible();
    expect(within(column('Entrevistas')).getByText('Backend Engineer')).toBeVisible();
    expect(within(column('Sin respuesta')).getByText('SRE')).toBeVisible();
    // Closed: only the count until it is opened.
    const closed = column('Cerradas');
    expect(within(closed).queryByText('Platform Engineer')).not.toBeInTheDocument();
    await user.click(within(closed).getByRole('button', { name: 'Ver 1' }));
    expect(within(closed).getByText('Platform Engineer')).toBeVisible();
    expect(within(closed).getByText('Rechazada')).toBeVisible();
  });

  it('moves a card forward from its menu, with the keyboard', async () => {
    const { user } = await renderScreen(<ApplicationsPage />);
    const trigger = await screen.findByRole('button', { name: 'Mover «Backend Engineer» a…' });
    trigger.focus();
    await user.keyboard('{Enter}');
    const menu = await screen.findByRole('menu');
    // Only where it can go: not where it is.
    expect(within(menu).queryByRole('menuitem', { name: 'Entrevistas' })).not.toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitem', { name: 'Oferta' }));

    expect(await screen.findByText('«Backend Engineer» pasó a Oferta.')).toBeVisible();
    expect(moves).toEqual([{ id: 'a2', body: { to: 'OFFER', confirmBackward: false } }]);
    await waitFor(() =>
      expect(within(column('Ofertas')).getByText('Backend Engineer')).toBeVisible(),
    );
  });

  it('asks to confirm going back (RN-09) and reopening (RN-10)', async () => {
    const { user } = await renderScreen(<ApplicationsPage />);
    let menu = await openMenu(user, 'Backend Engineer');
    await user.click(within(menu).getByRole('menuitem', { name: 'Primer contacto' }));
    let dialog = await screen.findByRole('dialog', { name: '¿Volver a Primer contacto?' });
    expect(moves).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: 'Mover' }));
    await waitFor(() =>
      expect(moves).toEqual([{ id: 'a2', body: { to: 'SCREENING', confirmBackward: true } }]),
    );

    await user.click(within(column('Cerradas')).getByRole('button', { name: 'Ver 1' }));
    menu = await openMenu(user, 'Platform Engineer');
    // A closed one only reopens in a state in progress.
    expect(within(menu).queryByRole('menuitem', { name: 'Aceptada' })).not.toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitem', { name: 'Entrevistas' }));
    dialog = await screen.findByRole('dialog', { name: '¿Reabrir en Entrevistas?' });
    await user.click(within(dialog).getByRole('button', { name: 'Mover' }));
    await waitFor(() =>
      expect(moves.at(-1)).toEqual({
        id: 'a3',
        body: { to: 'INTERVIEWING', confirmBackward: false },
      }),
    );
  });

  it('asks how a saved one was sent before it moves past SAVED', async () => {
    const { user } = await renderScreen(<ApplicationsPage />);
    const menu = await openMenu(user, 'Data Engineer');
    // Nothing was sent to reject or to wait for.
    expect(within(menu).queryByRole('menuitem', { name: 'Rechazada' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Sin respuesta' })).not.toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitem', { name: 'Entrevistas' }));

    const dialog = await screen.findByRole('dialog', {
      name: '¿Cómo la enviaste? (pasa a Entrevistas)',
    });
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'La envié sin un CV hecho con Careerly' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Mover' }));
    await waitFor(() =>
      expect(moves).toEqual([
        {
          id: 'a1',
          body: {
            to: 'INTERVIEWING',
            sent: { resumeVersionIds: [], sentWithoutCareerlyCv: true, sentAt: expect.any(String) },
          },
        },
      ]),
    );
  });
});

describe('the applications table', () => {
  it('filters by search, state and company', async () => {
    const { user } = await renderScreen(<ApplicationsPage />, { path: '/?view=table' });
    expect(await screen.findByText('4 postulaciones')).toBeVisible();
    const rows = () => screen.getAllByRole('row').slice(1);
    expect(rows()).toHaveLength(4);

    await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'engineer');
    expect(screen.getByText('3 postulaciones')).toBeVisible();

    await user.click(screen.getByRole('checkbox', { name: 'Entrevistas' }));
    expect(rows().map((row) => within(row).getAllByRole('cell')[0]!.textContent)).toEqual([
      'Backend Engineer',
    ]);

    await user.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Empresa' }), 'Acme');
    expect(rows().map((row) => within(row).getAllByRole('cell')[0]!.textContent)).toEqual([
      'Data Engineer',
      'SRE',
    ]);
  });

  it('switches between the board and the table', async () => {
    const { user } = await renderScreen(<ApplicationsPage />);
    expect(await screen.findByRole('region', { name: 'Guardadas' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Tabla' }));
    expect(await screen.findByRole('table', { name: 'Postulaciones' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tabla' })).toHaveAttribute('aria-pressed', 'true');
  });
});
