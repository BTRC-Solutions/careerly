// @vitest-environment jsdom
import type { TelemetryStats } from '@careerly/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

/* The public page (roadmap 8.6, RF-TEL-10) against a stubbed `/api/stats`. */

const STATS: TelemetryStats = {
  from: '2026-10-22',
  to: '2026-11-20',
  activeInstalls: 12,
  activeByDay: [],
  activeByWeek: [
    { week: '2026-11-09', installs: null },
    { week: '2026-11-16', installs: 12 },
  ],
  applicationsByWeek: [
    { week: '2026-11-09', created: null },
    { week: '2026-11-16', created: 40 },
  ],
  sources: { other: 5, 'linkedin.com': 30 },
  positionCategories: { 'backend:senior': 9 },
  funnel: { APPLIED: 14 },
  workMode: { remote: 11 },
  countries: { AR: 20 },
  outputLanguages: {},
  positionTitles: [{ title: 'Backend Engineer', installs: 6 }],
  features: { installs: 8, resumesGenerated: null, gapsAnswered: 60, medianDailyAiTokens: 9000 },
};

let requested: string[];

beforeEach(() => {
  requested = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      requested.push(url);
      return new Response(JSON.stringify(STATS), { status: 200 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('shows the headline numbers, and “fewer than 5” for what is hidden', async () => {
    render(<App language="es" />);

    expect(await screen.findByText('Instalaciones activas')).toBeTruthy();
    const tile = (label: string) => screen.getByText(label).parentElement!;
    expect(within(tile('Instalaciones activas')).getByText('12')).toBeTruthy();
    // Only the weeks that are shown add up.
    expect(within(tile('Postulaciones creadas')).getByText('40')).toBeTruthy();
    expect(within(tile('CVs generados')).getByText('menos de 5')).toBeTruthy();
    expect(requested).toEqual(['/api/stats?range=30']);
  });

  it('lists each metric largest first, with readable labels and its values as text', async () => {
    render(<App language="es" />);

    const sources = within(
      (await screen.findByRole('heading', { name: 'Dónde estaban las ofertas' })).parentElement!,
    );
    expect(sources.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'linkedin.com30',
      'Otros sitios5',
    ]);
    const countries = within(screen.getByRole('heading', { name: 'Países' }).parentElement!);
    expect(countries.getByText('Argentina')).toBeTruthy();
    expect(screen.getByText('Backend · senior')).toBeTruthy();
    expect(screen.getByText('Enviada')).toBeTruthy();
    const languages = within(
      screen.getByRole('heading', { name: 'Idioma de los CVs' }).parentElement!,
    );
    expect(languages.getByText('Todavía no hay datos suficientes.')).toBeTruthy();
  });

  it('describes each week column for screen readers, including the hidden ones', async () => {
    render(<App language="en" />);

    const chart = await screen.findByRole('figure', { name: 'Active installations per week' });
    const weeks = within(chart).getAllByRole('img')[0]!.querySelectorAll('g[aria-label]');
    expect([...weeks].map((week) => week.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/^Week of .*: fewer than 5$/),
      expect.stringMatching(/^Week of .*: 12$/),
    ]);
  });

  it('says so when the statistics are not available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 502 })),
    );
    render(<App language="en" />);
    expect((await screen.findByRole('alert')).textContent).toContain('not available');
  });
});
