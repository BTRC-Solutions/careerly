import { type ResumeDocument, TemplateDataSchema } from '@careerly/contracts';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTempDir, HAS_TYPST, TEMPLATES_DIR } from '../../test-support/temp-dir.js';
import { type RunningServer, startTestServer, testConfig } from '../../test-support/test-server.js';
import { RenderError, ResumeRenderService, TemplateNotFoundError } from './index.js';

/*
 * The documents module rendering real PDFs through the Typst adapter (roadmap 3.3, ADR-14). The cases that
 * need Typst are skipped without it (see `TEST_TYPST_BINARY`); CI always has it.
 */

const { labels: _labels, ...EXAMPLE } = TemplateDataSchema.parse(
  JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, 'examples', 'example.en.json'), 'utf8')),
);
const DOCUMENT: ResumeDocument = EXAMPLE;

describe('documents: rendering', () => {
  let temp: ReturnType<typeof createTempDir>;
  let server: RunningServer | undefined;

  beforeEach(() => {
    temp = createTempDir();
  });

  afterEach(async () => {
    await server?.close();
    server = undefined;
    temp.cleanup();
  });

  async function renderService(env: NodeJS.ProcessEnv = {}): Promise<ResumeRenderService> {
    server = await startTestServer(testConfig(path.join(temp.dir, 'data'), env));
    return server.app.get(ResumeRenderService);
  }

  /** A templates folder with one template, `custom`, whose source is `typ`. */
  function customTemplates(typ: string): string {
    const dir = path.join(temp.dir, 'templates', 'custom');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'template.typ'), typ);
    fs.writeFileSync(
      path.join(dir, 'template.json'),
      JSON.stringify({ id: 'custom', name: 'Custom', version: 3 }),
    );
    return path.dirname(dir);
  }

  async function renderError(promise: Promise<unknown>): Promise<RenderError> {
    const error = await promise.then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(RenderError);
    return error as RenderError;
  }

  describe.skipIf(!HAS_TYPST)('with Typst', () => {
    it('renders a CV with the default template into a PDF', async () => {
      const service = await renderService();

      const rendered = await service.render(DOCUMENT);

      expect(rendered).toMatchObject({ templateId: 'classic', templateVersion: 1, pageCount: 1 });
      const pdf = await PDFDocument.load(rendered.pdf);
      expect(pdf.getPageCount()).toBe(1);
      expect(pdf.getTitle()).toBe(`${DOCUMENT.basics.name} — CV`);
    });

    it('counts the pages: a long CV takes 2, a short one 1', async () => {
      const service = await renderService();
      const short: ResumeDocument = {
        ...DOCUMENT,
        summary: null,
        experience: DOCUMENT.experience.slice(0, 1),
        projects: [],
      };
      const long: ResumeDocument = {
        ...DOCUMENT,
        experience: [...DOCUMENT.experience, ...DOCUMENT.experience, ...DOCUMENT.experience],
      };

      const [shortCv, longCv] = await Promise.all([service.render(short), service.render(long)]);

      expect(shortCv.pageCount).toBe(1);
      expect(longCv.pageCount).toBe(2);
      expect((await PDFDocument.load(longCv.pdf)).getPageCount()).toBe(2);
    });

    it('gives the template the data and the labels as JSON', async () => {
      const templates = customTemplates(
        '#let data = json("data.json")\n#set document(title: data.basics.name + " / " + data.labels.present)\nok',
      );
      const service = await renderService({ CAREERLY_TEMPLATES_DIR: templates });

      const rendered = await service.render(
        { ...DOCUMENT, basics: { ...DOCUMENT.basics, name: '#eval("1 + 1") *bold*' } },
        'custom',
      );

      expect(rendered.templateVersion).toBe(3);
      const pdf = await PDFDocument.load(rendered.pdf);
      expect(pdf.getTitle()).toBe('#eval("1 + 1") *bold* / Present');
    });

    it('reports the diagnostics of a template that does not compile', async () => {
      const templates = customTemplates('#undefined-function()');
      const service = await renderService({ CAREERLY_TEMPLATES_DIR: templates });

      const error = await renderError(service.render(DOCUMENT, 'custom'));

      expect(error.reason).toBe('COMPILE_ERROR');
      expect(error.diagnostics).toContain('unknown variable');
    });

    it('does not let a template read files outside its folder', async () => {
      fs.writeFileSync(path.join(temp.dir, 'secret.txt'), 'secret');
      const templates = customTemplates('#read("../secret.txt")');
      const service = await renderService({ CAREERLY_TEMPLATES_DIR: templates });

      const error = await renderError(service.render(DOCUMENT, 'custom'));

      expect(error.reason).toBe('COMPILE_ERROR');
      expect(error.diagnostics).not.toContain('secret\n');
    });

    it('kills a render that takes longer than the timeout', async () => {
      const templates = customTemplates('#let n = 0\n#for i in range(100000000) { n += 1 }\n#n');
      const service = await renderService({
        CAREERLY_TEMPLATES_DIR: templates,
        CAREERLY_RENDER_TIMEOUT_MS: '300',
      });

      const started = Date.now();
      const error = await renderError(service.render(DOCUMENT, 'custom'));

      expect(error.reason).toBe('TIMEOUT');
      expect(Date.now() - started).toBeLessThan(5_000);
    });
  });

  it('fails clearly when Typst is missing', async () => {
    const service = await renderService({
      CAREERLY_TYPST_BIN: path.join(temp.dir, 'no-typst', 'typst'),
    });

    const error = await renderError(service.render(DOCUMENT));

    expect(error.reason).toBe('RENDERER_UNAVAILABLE');
  });

  it('rejects an unknown template', async () => {
    const service = await renderService();

    await expect(service.render(DOCUMENT, 'missing')).rejects.toBeInstanceOf(TemplateNotFoundError);
    await expect(service.render(DOCUMENT, '../classic')).rejects.toBeInstanceOf(
      TemplateNotFoundError,
    );
  });
});
