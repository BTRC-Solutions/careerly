// @vitest-environment jsdom
import type { SettingsResponse, TelemetrySettingsResponse } from '@careerly/contracts';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, apiServer, setupApiServer } from '../../../test-support/api-server';
import { renderScreen } from '../../../test-support/render';
import { PrivacyPage } from './PrivacyPage';

/* The privacy screen (roadmap 8.4, RNF-01, RF-TEL-02) against a mocked API. */

setupApiServer();

const SETTINGS: SettingsResponse = {
  preferences: { uiLanguage: 'es', onboardingCompletedAt: '2026-11-01T10:00:00.000Z' },
  dataDir: 'C:\\Users\\ana\\AppData\\Roaming\\Careerly',
  appVersion: '0.7.0',
  aiKey: { configured: true, provider: 'gemini' },
};

const TELEMETRY: TelemetrySettingsResponse = {
  status: 'REJECTED',
  consentVersion: 1,
  promptRequired: false,
  metrics: [{ id: 'activeUsage', enabled: false, isNew: false }],
  installId: null,
};

beforeEach(() => {
  apiServer.use(
    http.get(api('/settings'), () => HttpResponse.json(SETTINGS)),
    http.get(api('/telemetry/settings'), () => HttpResponse.json(TELEMETRY)),
    http.get(api('/telemetry/reports'), () => HttpResponse.json({ reports: [] })),
  );
});

describe('PrivacyPage', () => {
  it('says what stays on this computer and where', async () => {
    await renderScreen(<PrivacyPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Privacidad' })).toBeTruthy();
    const local = within(
      screen.getByRole('heading', { name: 'Lo que queda en tu computadora' }).parentElement!,
    );
    expect(await local.findByText(SETTINGS.dataDir)).toBeTruthy();
    expect(local.getByText(/API key se guarda cifrada/)).toBeTruthy();
    expect(local.getByText(/nunca el contenido de tu perfil/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Configuración' }).getAttribute('href')).toBe(
      '/settings',
    );
  });

  it('says what each AI function sends to the provider and what never goes', async () => {
    await renderScreen(<PrivacyPage />);

    const ai = within(
      screen.getByRole('heading', { name: 'Lo que se envía al proveedor de IA' }).parentElement!,
    );
    expect(ai.getAllByRole('term').map((term) => term.textContent)).toEqual([
      'Analizar una oferta',
      'Importar un CV',
      'Sugerir la redacción de un logro',
      'Comparar tu perfil con una oferta y generar el CV',
    ]);
    expect(ai.getByText('Nunca se envía a la IA')).toBeTruthy();
    expect(ai.getByText(/postulaciones, contactos, notas ni salarios/)).toBeTruthy();
  });

  it('includes the usage statistics, with what they never send and how long they are kept', async () => {
    await renderScreen(<PrivacyPage />);

    expect(
      await screen.findByRole('heading', { name: 'Estadísticas de uso anónimas' }),
    ).toBeTruthy();
    expect(await screen.findByText('Nunca se envía')).toBeTruthy();
    expect(screen.getByText(/se guardan sin límite de tiempo/)).toBeTruthy();
  });

  it('is in English too', async () => {
    await renderScreen(<PrivacyPage />, { language: 'en' });

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'What is sent to the AI provider' })).toBeTruthy();
  });
});
