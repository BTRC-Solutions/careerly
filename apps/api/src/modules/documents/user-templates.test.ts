import { type ResumeDocument, TemplateDataSchema, type TemplateSummary } from '@careerly/contracts';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTempDir, HAS_TYPST, TEMPLATES_DIR } from '../../test-support/temp-dir.js';
import {
  type RunningServer,
  startTestServer,
  TEST_TOKEN,
  testConfig,
} from '../../test-support/test-server.js';
import {
  ResumeRenderer,
  TemplateCatalog,
  TemplateNotFoundError,
  type TemplateUsage,
  UserTemplateError,
  UserTemplateStore,
} from './application/documents.ports.js';
import { ResumeRenderService } from './application/resume-render.service.js';
import { UserTemplatesService } from './application/user-templates.service.js';

/*
 * The user's own templates (roadmap 4.12, ADR-24), through the real API and the Typst CLI. The cases that render
 * need Typst and are skipped without it (CI always has it).
 */

const CLASSIC_SOURCE = fs.readFileSync(path.join(TEMPLATES_DIR, 'classic', 'template.typ'), 'utf8');
const EXAMPLE_EN = TemplateDataSchema.parse(
  JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, 'examples', 'example.en.json'), 'utf8')),
);
const { labels: _labels, ...DOCUMENT }: { labels: unknown } & ResumeDocument = EXAMPLE_EN;

describe('user templates (integration)', () => {
  let temp: ReturnType<typeof createTempDir>;
  let server: RunningServer;
  let templatesFolder: string;

  beforeEach(async () => {
    temp = createTempDir();
    server = await startTestServer(testConfig(path.join(temp.dir, 'data')));
    templatesFolder = path.join(temp.dir, 'data', 'files', 'templates');
  });

  afterEach(async () => {
    await server.close();
    temp.cleanup();
  });

  function url(route: string): string {
    return `http://127.0.0.1:${server.port}${route}`;
  }

  function auth(): Record<string, string> {
    return { Authorization: `Bearer ${TEST_TOKEN}` };
  }

  function upload(content: string | Buffer, fileName = 'Mi plantilla.typ', name?: string) {
    const form = new FormData();
    const bytes = typeof content === 'string' ? content : new Uint8Array(content);
    form.append('file', new Blob([bytes]), fileName);
    if (name !== undefined) form.append('name', name);
    return fetch(url('/templates'), { method: 'POST', headers: auth(), body: form });
  }

  function call(method: string, route: string, body?: unknown) {
    return fetch(url(route), {
      method,
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function listed(): Promise<TemplateSummary[]> {
    return (await (await call('GET', '/templates')).json()) as TemplateSummary[];
  }

  function onlyBuiltIn(): unknown[] {
    return [expect.objectContaining({ id: 'classic', builtIn: true })];
  }

  describe.skipIf(!HAS_TYPST)('uploading with Typst', () => {
    it('stores a valid template as version 1 and it can render a CV', async () => {
      const response = await upload(CLASSIC_SOURCE, 'Moderna.typ');
      expect(response.status).toBe(201);
      const created = (await response.json()) as TemplateSummary;
      expect(created).toEqual({
        id: expect.stringMatching(/^custom-[0-9a-f]{8}$/),
        name: 'Moderna',
        version: 1,
        builtIn: false,
      });

      expect(await listed()).toContainEqual(created);
      expect(fs.existsSync(path.join(templatesFolder, created.id, '1', 'template.typ'))).toBe(true);

      const rendered = await server.app
        .get(ResumeRenderService)
        .render(DOCUMENT as ResumeDocument, created.id);
      expect(rendered).toMatchObject({ templateId: created.id, templateVersion: 1 });
      expect(rendered.pdf.byteLength).toBeGreaterThan(0);
    });

    it('takes the name from the form field when given', async () => {
      const response = await upload(CLASSIC_SOURCE, 'x.typ', 'Mi estilo');
      expect(((await response.json()) as TemplateSummary).name).toBe('Mi estilo');
    });

    it('rejects a template that does not compile and keeps nothing of it', async () => {
      const response = await upload('#let x = (\n');
      expect(response.status).toBe(422);
      const body = (await response.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe('TEMPLATE_INVALID');
      // The Typst diagnostics go back to the author so they can fix the file.
      expect(body.error.message).toContain('#let x = (');
      // …naming the file as they know it, not by the temporary folder it was rendered in.
      expect(body.error.message).toMatch(/─ template\.typ:\d+:\d+/);
      expect(body.error.message).not.toContain('careerly-render-');
      expect(await listed()).toEqual(onlyBuiltIn());
      expect(fs.existsSync(templatesFolder) ? fs.readdirSync(templatesFolder) : []).toEqual([]);
    });

    it('rejects a template that takes longer than the render timeout', async () => {
      await server.close();
      server = await startTestServer(
        testConfig(path.join(temp.dir, 'data'), { CAREERLY_RENDER_TIMEOUT_MS: '500' }),
      );
      // 10^8 loop steps: many seconds on any machine, far over the 500 ms timeout. Two nested ranges, because
      // one range that long would allocate gigabytes. (2 * 10^6 steps fit under 500 ms on the CI's Ubuntu.)
      const slow =
        '#let n = 0\n#for i in range(10000) { for j in range(10000) { n = n + 1 } }\n#n\n';

      const response = await upload(slow);
      expect(response.status).toBe(422);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe('TEMPLATE_TIMEOUT');
      expect(await listed()).toEqual(onlyBuiltIn());
    });

    it('renames a template and keeps its version', async () => {
      const created = (await (await upload(CLASSIC_SOURCE, 'Vieja.typ')).json()) as TemplateSummary;

      const response = await call('PATCH', `/templates/${created.id}`, { name: 'Nueva' });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ...created, name: 'Nueva' });
      expect(await listed()).toContainEqual({ ...created, name: 'Nueva' });
    });

    it('deletes a template and its files', async () => {
      const created = (await (await upload(CLASSIC_SOURCE)).json()) as TemplateSummary;

      expect((await call('DELETE', `/templates/${created.id}`)).status).toBe(204);
      expect(await listed()).toEqual(onlyBuiltIn());
      expect(fs.existsSync(path.join(templatesFolder, created.id))).toBe(false);
    });

    it('does not list a template while its examples are being rendered', async () => {
      const store = server.app.get(UserTemplateStore);
      const renderer = server.app.get(ResumeRenderer);
      const listedWhileRendering: string[][] = [];
      const service = new UserTemplatesService(
        server.app.get(TemplateCatalog),
        store,
        {
          render: async (template, data) => {
            listedWhileRendering.push((await store.list()).map(({ id }) => id));
            return renderer.render(template, data);
          },
        } satisfies ResumeRenderer,
        { isUsed: async () => false } satisfies TemplateUsage,
      );

      const created = await service.upload(Buffer.from(CLASSIC_SOURCE), 'Nueva');
      expect(listedWhileRendering).toEqual([[], []]);
      expect(await listed()).toContainEqual(created);
    });

    it('previews any template with the example of each language as a PDF', async () => {
      const created = (await (await upload(CLASSIC_SOURCE)).json()) as TemplateSummary;

      for (const id of ['classic', created.id]) {
        for (const language of ['es', 'en']) {
          const response = await call('GET', `/templates/${id}/preview/${language}`);
          expect(response.status, `${id} ${language}`).toBe(200);
          expect(response.headers.get('content-type')).toBe('application/pdf');
          const pdf = await PDFDocument.load(await response.arrayBuffer());
          expect(pdf.getPageCount()).toBeGreaterThan(0);
        }
      }
    });

    it('keeps a template that a snapshot uses', async () => {
      const created = (await (await upload(CLASSIC_SOURCE)).json()) as TemplateSummary;
      const service = new UserTemplatesService(
        server.app.get(TemplateCatalog),
        server.app.get(UserTemplateStore),
        server.app.get(ResumeRenderer),
        { isUsed: async () => true } satisfies TemplateUsage,
      );

      await expect(service.delete(created.id)).rejects.toBeInstanceOf(UserTemplateError);
      expect(await listed()).toContainEqual(created);
      expect(fs.existsSync(path.join(templatesFolder, created.id, '1', 'template.typ'))).toBe(true);
    });
  });

  it('rejects files that are not text .typ files', async () => {
    const notTypst = await upload(CLASSIC_SOURCE, 'plantilla.txt');
    expect(notTypst.status).toBe(400);

    const binary = await upload(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]), 'binario.typ');
    expect(binary.status).toBe(400);

    expect(await listed()).toEqual(onlyBuiltIn());
  });

  it('reports a missing Typst CLI with its own error code', async () => {
    await server.close();
    server = await startTestServer(
      testConfig(path.join(temp.dir, 'data'), {
        CAREERLY_TYPST_BIN: path.join(temp.dir, 'no-typst'),
      }),
    );

    const response = await upload(CLASSIC_SOURCE);
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('RENDERER_UNAVAILABLE');
    expect(await listed()).toEqual(onlyBuiltIn());
  });

  it('refuses previews of unknown templates or languages', async () => {
    expect((await call('GET', '/templates/custom-00000000/preview/es')).status).toBe(404);
    expect((await call('GET', '/templates/classic/preview/fr')).status).toBe(400);
  });

  it('downloads the default template and the examples as a starting point', async () => {
    const response = await call('GET', '/templates/starter-kit');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('content-disposition')).toContain('.zip');

    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    expect(Object.keys(zip.files).filter((name) => !name.endsWith('/'))).toEqual(
      expect.arrayContaining([
        'template.typ',
        'examples/example.en.json',
        'examples/example.es.json',
      ]),
    );
    expect(await zip.file('template.typ')?.async('string')).toBe(CLASSIC_SOURCE);
  });

  it('refuses to rename or delete the built-in templates and unknown ids', async () => {
    expect((await call('PATCH', '/templates/classic', { name: 'Otra' })).status).toBe(403);
    expect((await call('DELETE', '/templates/classic')).status).toBe(403);
    expect((await call('PATCH', '/templates/custom-00000000', { name: 'Otra' })).status).toBe(404);
    expect((await call('DELETE', '/templates/..')).status).toBe(404);
  });

  it('reports a missing template as not found through the catalog', async () => {
    await expect(server.app.get(TemplateCatalog).get('custom-00000000')).rejects.toBeInstanceOf(
      TemplateNotFoundError,
    );
  });
});
