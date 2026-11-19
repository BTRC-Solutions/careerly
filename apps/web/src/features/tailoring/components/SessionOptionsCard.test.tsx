// @vitest-environment jsdom
import type {
  TailoringSession,
  TailoringSessionView,
  UpdateTailoringOptionsRequest,
} from '@careerly/contracts';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, apiError, apiServer, setupApiServer } from '../../../test-support/api-server';
import { renderScreen } from '../../../test-support/render';
import { SessionOptionsCard } from './SessionOptionsCard';

/* The CV options of a session (roadmap 6.1, RF-TAIL-07 to RF-TAIL-09) against a mocked API. */

setupApiServer();

const SESSION: TailoringSession = {
  id: 'session-1',
  jobPostingId: 'posting-1',
  languages: ['es'],
  pageBudget: 1,
  templateId: 'classic',
  status: 'MATCHED',
  failedStep: null,
  regeneration: null,
  match: null,
  createdAt: '2026-11-18T12:00:00.000Z',
  updatedAt: '2026-11-18T12:00:00.000Z',
};

let updates: UpdateTailoringOptionsRequest[];

beforeEach(() => {
  updates = [];
  apiServer.use(
    http.get(api('/templates'), () =>
      HttpResponse.json([
        { id: 'classic', name: 'Clásica', version: 1, builtIn: true, finalizedResumes: 0 },
        { id: 'mine', name: 'Mi plantilla', version: 2, builtIn: false, finalizedResumes: 0 },
      ]),
    ),
    http.patch(api('/tailoring-sessions/session-1/options'), async ({ request }) => {
      const body = (await request.json()) as UpdateTailoringOptionsRequest;
      updates.push(body);
      const view: TailoringSessionView = { session: { ...SESSION, ...body }, job: null };
      return HttpResponse.json(view);
    }),
  );
});

const render = (session: TailoringSession = SESSION) =>
  renderScreen(<SessionOptionsCard session={session} />);

describe('SessionOptionsCard', () => {
  it('saves each option as it changes', async () => {
    const { user } = await render();

    // The only language cannot be unchecked.
    expect(screen.getByRole('checkbox', { name: 'Español' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Inglés' }));
    await waitFor(() => expect(updates).toEqual([{ languages: ['es', 'en'] }]));

    await user.click(screen.getByRole('radio', { name: '2 páginas' }));
    await waitFor(() => expect(updates.at(-1)).toEqual({ pageBudget: 2 }));

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Plantilla' }),
      'Mi plantilla',
    );
    await waitFor(() => expect(updates.at(-1)).toEqual({ templateId: 'mine' }));
  });

  it('cannot change while generating', async () => {
    await render({ ...SESSION, status: 'GENERATING' });

    expect(screen.getByText(/No se pueden cambiar mientras se generan/)).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Inglés' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: '2 páginas' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Plantilla' })).toBeDisabled();
  });

  it('shows the error when saving fails', async () => {
    apiServer.use(
      http.patch(api('/tailoring-sessions/session-1/options'), () =>
        apiError(400, 'VALIDATION_FAILED', 'Template not found: mine.'),
      ),
    );
    const { user } = await render();
    await user.click(screen.getByRole('radio', { name: '2 páginas' }));

    expect(await screen.findByText(/Template not found/)).toBeVisible();
  });
});
