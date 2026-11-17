// @vitest-environment jsdom
import type {
  Achievement,
  AchievementSuggestion,
  SuggestAchievementRequest,
} from '@careerly/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, apiError, apiServer, setupApiServer } from '../../../test-support/api-server';
import { renderScreen } from '../../../test-support/render';
import { AchievementList } from './AchievementList';

/*
 * Wording suggestions in the achievement editor (roadmap 4.8, RF-PROF-10): the user accepts or discards each
 * suggestion, and nothing changes without their confirmation.
 */

setupApiServer();

const ACHIEVEMENT: Achievement = {
  id: 'a1',
  text: 'hice que pagos ande mas rapido con cache en Redis',
  metrics: '-40% p95',
  tools: [],
  origin: 'MANUAL',
  originSessionId: null,
  createdAt: '2026-11-17T12:00:00.000Z',
  updatedAt: '2026-11-17T12:00:00.000Z',
};

const SUGGESTION: AchievementSuggestion = {
  text: 'Reduje la latencia p95 del servicio de pagos con una caché en Redis.',
  metrics: '-40 % latencia p95',
  questions: ['¿Cuántas transacciones por día procesa?'],
};

let asked: SuggestAchievementRequest[];
let saved: unknown[];

beforeEach(() => {
  asked = [];
  saved = [];
  apiServer.use(
    http.get(api('/ai/status'), () =>
      HttpResponse.json({ configured: true, provider: 'gemini', keyRejected: false }),
    ),
    http.post(api('/profile/achievements/suggestions'), async ({ request }) => {
      asked.push((await request.json()) as SuggestAchievementRequest);
      return HttpResponse.json(SUGGESTION);
    }),
    http.patch(api('/profile/achievements/:id'), async ({ request }) => {
      const body = (await request.json()) as Partial<Achievement>;
      saved.push(body);
      return HttpResponse.json({ ...ACHIEVEMENT, ...body });
    }),
  );
});

async function editAchievement() {
  const screenApi = await renderScreen(
    <AchievementList parent={{ kind: 'position', id: 'p1' }} achievements={[ACHIEVEMENT]} />,
  );
  await screenApi.user.click(screen.getByRole('button', { name: 'Editar el logro 1' }));
  // The editor comes first; the composer for new achievements is below it.
  const text = screen.getAllByRole('textbox', { name: 'Qué hiciste' })[0]!;
  const editor = within(text.closest('form')!);
  return { ...screenApi, editor, text };
}

describe('achievement wording suggestions', () => {
  it('replaces the text only when the suggestion is accepted, and saves only with the form', async () => {
    const { user, editor, text } = await editAchievement();

    await user.click(editor.getByRole('button', { name: 'Sugerir redacción con IA' }));
    const panel = await editor.findByRole('region', { name: 'Redacción sugerida' });
    expect(asked).toEqual([{ text: ACHIEVEMENT.text, metrics: ACHIEVEMENT.metrics }]);
    expect(within(panel).getByText(SUGGESTION.text)).toBeInTheDocument();
    expect(within(panel).getByText('¿Cuántas transacciones por día procesa?')).toBeInTheDocument();
    // Nothing changed yet.
    expect(text).toHaveValue(ACHIEVEMENT.text);

    await user.click(within(panel).getByRole('button', { name: 'Usar esta redacción' }));
    expect(text).toHaveValue(SUGGESTION.text);
    expect(editor.getByRole('textbox', { name: 'Métricas' })).toHaveValue(SUGGESTION.metrics);
    expect(editor.queryByRole('region', { name: 'Redacción sugerida' })).not.toBeInTheDocument();
    expect(saved).toEqual([]);

    await user.click(editor.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toMatchObject({ text: SUGGESTION.text, metrics: SUGGESTION.metrics });
  });

  it('leaves everything as it was when the suggestion is discarded', async () => {
    const { user, editor, text } = await editAchievement();

    await user.click(editor.getByRole('button', { name: 'Sugerir redacción con IA' }));
    const panel = await editor.findByRole('region', { name: 'Redacción sugerida' });
    await user.click(within(panel).getByRole('button', { name: 'Descartar' }));

    expect(editor.queryByRole('region', { name: 'Redacción sugerida' })).not.toBeInTheDocument();
    expect(text).toHaveValue(ACHIEVEMENT.text);
    expect(editor.getByRole('textbox', { name: 'Métricas' })).toHaveValue(ACHIEVEMENT.metrics);
    expect(saved).toEqual([]);
  });

  it('explains a suggestion discarded for inventing data', async () => {
    apiServer.use(
      http.post(api('/profile/achievements/suggestions'), () =>
        apiError(502, 'AI_UNFAITHFUL', 'Discarded.'),
      ),
    );
    const { user, editor, text } = await editAchievement();

    await user.click(editor.getByRole('button', { name: 'Sugerir redacción con IA' }));
    expect(await editor.findByText(/La IA agregó datos que tu logro no tiene/)).toBeInTheDocument();
    expect(text).toHaveValue(ACHIEVEMENT.text);
  });

  it('cannot ask without text or without an AI key', async () => {
    apiServer.use(
      http.get(api('/ai/status'), () =>
        HttpResponse.json({ configured: false, provider: null, keyRejected: false }),
      ),
    );
    await renderScreen(
      <AchievementList parent={{ kind: 'position', id: 'p1' }} achievements={[]} />,
    );
    const composer = within(screen.getByRole('form', { name: 'Nuevo logro' }));
    const button = composer.getByRole('button', { name: 'Sugerir redacción con IA' });
    expect(button).toBeDisabled();
    expect(await composer.findByText(/API key/)).toBeInTheDocument();
  });
});
