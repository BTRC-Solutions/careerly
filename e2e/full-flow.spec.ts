import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  _electron as electron,
  type ElectronApplication,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { type FakeGemini, startFakeGemini } from './fake-gemini.js';

const ROOT = path.resolve(import.meta.dirname, '..');

let app: ElectronApplication;
let page: Page;
let gemini: FakeGemini;
let dataDir: string;

test.beforeEach(async () => {
  gemini = await startFakeGemini({
    requirements: () => ({
      language: 'en',
      roleCategory: 'backend',
      seniority: 'senior',
      workMode: 'remote',
      country: null,
      yearsOfExperience: 5,
      keywords: ['backend'],
      requirements: [
        { label: 'Node.js', kind: 'TOOL', importance: 'REQUIRED' },
        { label: 'PostgreSQL', kind: 'TOOL', importance: 'REQUIRED' },
      ],
    }),
    scores: () => ({ scores: [] }),
    // The CV cites the profile by the short references of the prompt ([W1], [A2]…).
    summary: (prompt) => {
      const ref = (text: string) =>
        new RegExp(String.raw`\[(\w+)\][^\n]*${text}`).exec(prompt)?.[1];
      const position = ref('Backend Engineer');
      const achievement = ref('Designed the public REST API');
      return {
        summary: 'Backend engineer of public APIs.',
        summarySources: [position, achievement],
        experiences: [
          {
            experience: position,
            bullets: [
              { text: 'Designed the public REST API used by 40 partners', sources: [achievement] },
            ],
          },
        ],
      };
    },
  });
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'careerly-e2e-'));
  app = await electron.launch({
    args: [path.join(ROOT, 'apps', 'desktop')],
    env: { ...process.env, CAREERLY_USER_DATA_DIR: dataDir, CAREERLY_GEMINI_BASE_URL: gemini.url },
  });
  page = await app.firstWindow();
});

// eslint-disable-next-line no-empty-pattern -- Playwright needs the fixtures pattern even when unused.
test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach('screen', { body: await page.screenshot(), contentType: 'image/png' });
    await testInfo.attach('aria', {
      body: await page.locator('body').ariaSnapshot(),
      contentType: 'text/plain',
    });
    await testInfo.attach('gemini calls', {
      body: JSON.stringify(gemini.calls),
      contentType: 'application/json',
    });
  }
  await app.close();
  await gemini.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('from the first start to a sent application', async () => {
  // First-run wizard: language, AI key, telemetry.
  // The choice is saved first and then shown, so click and wait instead of `check()`.
  const spanish = page.getByRole('radio', { name: 'Español', exact: true });
  await spanish.click();
  await expect(spanish).toBeChecked();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('textbox', { name: 'API key' }).fill('AIzaSyFakeGeminiKey_0123456789');
  await page.getByRole('button', { name: 'Verificar y guardar' }).click();
  await expect(page.getByText('Activa')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Rechazar todo' }).click();

  // The master profile: name, one position and one achievement that uses Node.js.
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  await nav.getByRole('link', { name: 'Perfil maestro' }).click();
  await page.getByRole('textbox', { name: 'Nombre(s)' }).fill('Ana');
  await page.getByRole('textbox', { name: 'Apellido(s)' }).fill('García');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Guardado')).toBeVisible();
  await page.getByRole('link', { name: 'Experiencia' }).click();
  await page.getByRole('button', { name: 'Agregar experiencia' }).click();
  const position = page.getByRole('dialog', { name: 'Agregar experiencia' });
  await position.getByRole('textbox', { name: 'Puesto' }).fill('Backend Engineer');
  await position.getByRole('textbox', { name: 'Empresa' }).fill('Acme');
  await position.getByRole('textbox', { name: 'Inicio' }).fill('2019-03');
  await position.getByRole('checkbox', { name: 'Trabajo acá actualmente' }).check();
  await position.getByRole('button', { name: 'Crear' }).click();
  const achievement = page.getByRole('form', { name: 'Nuevo logro' });
  await achievement
    .getByRole('textbox', { name: 'Qué hiciste' })
    .fill('Designed the public REST API used by 40 partners.');
  await achievement.getByRole('combobox', { name: 'Herramientas' }).fill('Node.js');
  await page.getByRole('option', { name: /^Node\.js/ }).click();
  await achievement.getByRole('button', { name: 'Agregar logro' }).click();
  await expect(page.getByRole('heading', { name: 'Logros (1)' })).toBeVisible();

  // A job posting that asks for Node.js and PostgreSQL, analyzed by the (fake) AI.
  await nav.getByRole('link', { name: 'Ofertas' }).click();
  await page.getByRole('link', { name: 'Nueva oferta' }).first().click();
  await page
    .getByRole('textbox', { name: 'Texto de la oferta' })
    .fill('Senior Backend Engineer at Globex. Node.js and PostgreSQL. Remote.');
  await page.getByRole('textbox', { name: 'Puesto' }).fill('Senior Backend Engineer');
  await page.getByRole('textbox', { name: 'Empresa' }).fill('Globex');
  await page.getByRole('button', { name: 'Guardar oferta' }).click();
  await page.getByRole('button', { name: 'Analizar con IA' }).click();
  await expect(page.getByRole('heading', { name: 'Requisitos obligatorios' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'PostgreSQL' })).toBeVisible();

  // The tailoring session: match, a gap question, the CV.
  await page.getByRole('button', { name: 'Adaptar mi CV' }).click();
  await expect(page.getByRole('heading', { name: 'Match con la oferta' })).toBeVisible();
  await expect(page.getByText('50%')).toBeVisible();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Faltante: PostgreSQL' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Responder' }).click();
  const question = page.getByRole('listitem', { name: '¿Usaste PostgreSQL?' });
  await question.getByRole('radio', { name: 'Sí, en un trabajo' }).click();
  await question.getByRole('checkbox', { name: 'Backend Engineer · Acme' }).check();
  await question
    .getByRole('textbox', { name: '¿Qué hiciste?' })
    .fill('Moved the billing data to PostgreSQL.');
  await question.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('1 de 1 respondidas')).toBeVisible();
  await page.getByRole('button', { name: 'Generar CV' }).click();
  await expect(page.getByRole('heading', { name: 'Revisión del CV' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByText('Designed the public REST API used by 40 partners').first(),
  ).toBeVisible();

  // The CV is frozen and becomes the application that is sent.
  await page.getByRole('button', { name: 'Finalizar CV' }).click();
  const finalize = page.getByRole('dialog', { name: '¿Finalizar los CVs?' });
  await finalize.getByRole('button', { name: /^Finalizar/ }).click();
  await expect(page.getByRole('heading', { name: 'CV finalizado' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(/1 página · plantilla «Clásica»/)).toBeVisible();
  await page.getByRole('button', { name: 'Crear postulación' }).click();
  const send = page.getByRole('dialog', { name: 'Crear postulación' });
  await expect(send.getByRole('radio', { name: 'Sí, ya la envié' })).toBeChecked();
  await expect(send.getByRole('checkbox', { name: /^CV en inglés/ })).toBeChecked();
  await send.getByRole('button', { name: 'Crear postulación' }).click();
  await expect(send).toBeHidden();
  await nav.getByRole('link', { name: 'Postulaciones' }).click();
  const sent = page.getByRole('region', { name: 'Enviadas' });
  await expect(sent.getByRole('link', { name: 'Senior Backend Engineer' })).toBeVisible();
  await expect(sent.getByText('Globex')).toBeVisible();

  // The frozen PDF is on disk, and every AI task went to the fake.
  const snapshots = path.join(dataDir, 'files', 'snapshots');
  const [version] = fs.readdirSync(snapshots);
  expect(fs.statSync(path.join(snapshots, version!, 'cv.pdf')).size).toBeGreaterThan(1000);
  // Verifying the key only lists the models; then the analysis, the relevance and the CV.
  expect(gemini.calls.map((keys) => keys[0])).toEqual(['language', 'scores', 'summary']);
});
