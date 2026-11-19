// @vitest-environment jsdom
import type { TemplateSummary } from '@careerly/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, apiError, apiServer, setupApiServer } from '../../../test-support/api-server';
import { renderScreen } from '../../../test-support/render';
import { TemplatesPage } from './TemplatesPage';

/*
 * The templates screen (roadmap 4.13) against a mocked API. What the browser does with the PDF (Chromium's
 * viewer) cannot be seen here: the tests check that the right preview is requested and handed to the frame.
 */

setupApiServer();

const CLASSIC: TemplateSummary = {
  id: 'classic',
  name: 'Clásica',
  version: 1,
  builtIn: true,
  finalizedResumes: 0,
};
const MINE: TemplateSummary = {
  id: 'custom-1a2b3c4d',
  name: 'Moderna',
  version: 1,
  builtIn: false,
  finalizedResumes: 0,
};

/** The templates the mocked API has; handlers change it like the real one would. */
let templates: TemplateSummary[];
/** `<id>/<language>` of every preview requested. */
let previews: string[];

beforeEach(() => {
  templates = [CLASSIC, MINE];
  previews = [];
  // jsdom has no `blob:` URLs.
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() });
  apiServer.use(
    http.get(api('/templates'), () => HttpResponse.json(templates)),
    http.get(api('/templates/:id/preview/:language'), ({ params }) => {
      previews.push(`${String(params.id)}/${String(params.language)}`);
      return new HttpResponse(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
        headers: { 'Content-Type': 'application/pdf' },
      });
    }),
  );
});

/** The list card, once the templates have loaded. */
async function templateList() {
  return within(
    (await screen.findByRole('heading', { name: 'Plantillas disponibles' })).parentElement!,
  );
}

/** The hidden input behind "Subir plantilla" (the button opens it; screen readers only see the button). */
function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type=file]');
  if (!input) throw new Error('No file input.');
  return input;
}

function previewHeading() {
  return screen.findByRole('heading', { name: /^Vista previa: / });
}

describe('TemplatesPage', () => {
  it('lists the templates and only lets the user change their own', async () => {
    await renderScreen(<TemplatesPage />);

    const list = await templateList();
    expect(await list.findByText('Clásica')).toBeInTheDocument();
    expect(list.getByText('Moderna')).toBeInTheDocument();
    expect(list.getByText('Incluida')).toBeInTheDocument();
    expect(list.getByText('Propia')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Renombrar «Moderna»' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar «Moderna»' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Renombrar «Clásica»' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar «Clásica»' })).not.toBeInTheDocument();
  });

  it('previews the selected template in Spanish and in English', async () => {
    const { user } = await renderScreen(<TemplatesPage />);

    expect(await previewHeading()).toHaveTextContent('Vista previa: Clásica');
    const frame = await screen.findByTitle('Vista previa de Clásica en Español');
    expect(frame).toHaveAttribute('src', 'blob:preview#navpanes=0&view=FitH');

    await user.click(screen.getByRole('button', { name: 'Inglés' }));
    expect(await screen.findByTitle('Vista previa de Clásica en Inglés')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inglés' })).toHaveAttribute('aria-pressed', 'true');

    await user.click((await templateList()).getByText('Moderna'));
    expect(await previewHeading()).toHaveTextContent('Vista previa: Moderna');
    await screen.findByTitle('Vista previa de Moderna en Español');

    expect(previews).toEqual(['classic/es', 'classic/en', 'custom-1a2b3c4d/es']);
  });

  it('uploads a template and shows its preview once it is validated', async () => {
    const created: TemplateSummary = {
      id: 'custom-99999999',
      name: 'Mi diseño',
      version: 1,
      builtIn: false,
      finalizedResumes: 0,
    };
    let uploaded = '';
    apiServer.use(
      http.post(api('/templates'), async ({ request }) => {
        // Raw multipart text: under jsdom, Node cannot parse it back into `File` objects.
        uploaded = await request.text();
        await delay(50);
        templates = [...templates, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    const { user } = await renderScreen(<TemplatesPage />);
    await (await templateList()).findByText('Clásica');

    await user.upload(fileInput(), new File(['#let data = json("data.json")'], 'Mi diseño.typ'));

    expect(screen.getByRole('button', { name: 'Validando…' })).toBeDisabled();
    expect(
      await screen.findByText('«Mi diseño» quedó disponible. Abajo está su vista previa.'),
    ).toBeInTheDocument();
    expect(uploaded).toMatch(/name="file"; filename="Mi dise.+\.typ"/);
    expect(uploaded).toContain('#let data = json("data.json")');
    expect(await (await templateList()).findByText('Mi diseño')).toBeInTheDocument();
    expect(await previewHeading()).toHaveTextContent('Vista previa: Mi diseño');
    await waitFor(() => expect(previews).toContain('custom-99999999/es'));
  });

  it("shows Typst's diagnostics when the template does not compile", async () => {
    apiServer.use(
      http.post(api('/templates'), () =>
        apiError(
          422,
          'TEMPLATE_INVALID',
          'The template could not be rendered.\n\nerror: unclosed delimiter\n  ┌─ template.typ:1:9',
        ),
      ),
    );
    const { user } = await renderScreen(<TemplatesPage />);
    await (await templateList()).findByText('Clásica');

    await user.upload(fileInput(), new File(['#let x = ('], 'Rota.typ'));

    expect(
      await screen.findByText(
        'La plantilla no compila con los CVs de ejemplo, así que no se guardó.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/error: unclosed delimiter/)).toHaveTextContent(
      'error: unclosed delimiter ┌─ template.typ:1:9',
      { normalizeWhitespace: true },
    );
    // The summary in English is replaced by the translated text.
    expect(screen.queryByText(/could not be rendered/)).not.toBeInTheDocument();
  });

  it('rejects a file that is not a .typ without calling the API', async () => {
    // A POST would fail the test: there is no handler for it.
    const { user } = await renderScreen(<TemplatesPage />, {
      userOptions: { applyAccept: false },
    });
    await (await templateList()).findByText('Clásica');

    await user.upload(fileInput(), new File(['hola'], 'notas.txt'));

    expect(
      await screen.findByText('Elegí un archivo .typ de texto, de hasta 256 KB.'),
    ).toBeInTheDocument();
  });

  it('renames a template', async () => {
    let body: unknown;
    apiServer.use(
      http.patch(api('/templates/:id'), async ({ request, params }) => {
        body = await request.json();
        templates = templates.map((template) =>
          template.id === params.id ? { ...template, name: 'Moderna 2' } : template,
        );
        return HttpResponse.json({ ...MINE, name: 'Moderna 2' });
      }),
    );
    const { user } = await renderScreen(<TemplatesPage />);

    await user.click(await screen.findByRole('button', { name: 'Renombrar «Moderna»' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renombrar plantilla' });
    const name = within(dialog).getByLabelText('Nombre');
    await user.clear(name);
    await user.type(name, '  Moderna 2  ');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(body).toEqual({ name: 'Moderna 2' });
    expect(await (await templateList()).findByText('Moderna 2')).toBeInTheDocument();
  });

  it('deletes a template after confirming and goes back to another one', async () => {
    const deleted: string[] = [];
    apiServer.use(
      http.delete(api('/templates/:id'), ({ params }) => {
        deleted.push(String(params.id));
        templates = templates.filter((template) => template.id !== params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await renderScreen(<TemplatesPage />);
    await user.click(await (await templateList()).findByText('Moderna'));
    expect(await previewHeading()).toHaveTextContent('Vista previa: Moderna');

    await user.click(screen.getByRole('button', { name: 'Eliminar «Moderna»' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Eliminar «Moderna»?' });
    expect(deleted).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    const list = await templateList();
    await waitFor(() => expect(list.queryByText('Moderna')).not.toBeInTheDocument());
    expect(deleted).toEqual(['custom-1a2b3c4d']);
    expect(await previewHeading()).toHaveTextContent('Vista previa: Clásica');
  });

  it('warns that finalized CVs use the template, which keep their own copy', async () => {
    templates = [CLASSIC, { ...MINE, finalizedResumes: 2 }];
    const { user } = await renderScreen(<TemplatesPage />);
    await user.click(await (await templateList()).findByText('Moderna'));

    await user.click(screen.getByRole('button', { name: 'Eliminar «Moderna»' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Eliminar «Moderna»?' });
    expect(
      within(dialog).getByText(
        'Se borra el archivo de la plantilla. La usan 2 CVs finalizados, que no cambian: guardan su propia copia.',
      ),
    ).toBeInTheDocument();
  });

  it('offers to retry when the templates cannot be loaded', async () => {
    let fail = true;
    apiServer.use(
      http.get(api('/templates'), () =>
        fail ? apiError(500, 'INTERNAL_ERROR') : HttpResponse.json(templates),
      ),
    );
    const { user } = await renderScreen(<TemplatesPage />);

    expect(await screen.findByText('No se pudieron cargar las plantillas.')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await (await templateList()).findByText('Clásica')).toBeInTheDocument();
  });

  it('is translated', async () => {
    await renderScreen(<TemplatesPage />, { language: 'en' });
    expect(await screen.findByRole('heading', { name: 'CV templates' })).toBeInTheDocument();
    expect(await screen.findByTitle('Preview of Clásica in Spanish')).toBeInTheDocument();
  });
});
