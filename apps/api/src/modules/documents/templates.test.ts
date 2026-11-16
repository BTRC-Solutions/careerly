import { type TemplateData, TemplateDataSchema } from '@careerly/contracts';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTempDir } from '../../test-support/temp-dir.js';
import { RESUME_LABELS, toTemplateData } from './domain/resume-labels.js';

/*
 * Built-in templates and the shared examples (ARCHITECTURE.md §9). The render test needs the Typst CLI: it uses
 * `TYPST_BIN` or `typst` from the PATH, and is skipped when there is none (CI gets a pinned binary in step 3.2).
 */

const TEMPLATES_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'templates');
const EXAMPLES_DIR = path.join(TEMPLATES_DIR, 'examples');

const builtInTemplates = fs
  .readdirSync(TEMPLATES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !['examples', 'fonts'].includes(entry.name))
  .map((entry) => entry.name);

const examples = fs
  .readdirSync(EXAMPLES_DIR)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({
    name,
    data: JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, name), 'utf8')) as unknown,
  }));

const typst = process.env.TYPST_BIN ?? 'typst';
const hasTypst = spawnSync(typst, ['--version']).status === 0;

describe('CV templates', () => {
  it('ships the classic template with its manifest', () => {
    expect(builtInTemplates).toContain('classic');
    for (const id of builtInTemplates) {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(TEMPLATES_DIR, id, 'template.json'), 'utf8'),
      ) as unknown;
      expect(manifest).toEqual({ id, name: expect.any(String), version: expect.any(Number) });
      expect(fs.existsSync(path.join(TEMPLATES_DIR, id, 'template.typ'))).toBe(true);
    }
  });

  it('has a valid example per language, with the labels the app adds', () => {
    const languages = examples.map(({ name, data }) => {
      const parsed = TemplateDataSchema.parse(data);
      const { labels, ...document } = parsed;
      expect(labels, name).toEqual(RESUME_LABELS[parsed.language]);
      expect(toTemplateData(document)).toEqual(parsed);
      return parsed.language;
    });
    expect(languages.sort()).toEqual(Object.keys(RESUME_LABELS).sort());
  });

  describe.skipIf(!hasTypst)('rendering with Typst', () => {
    let temp: ReturnType<typeof createTempDir>;
    beforeEach(() => {
      temp = createTempDir('careerly-templates-');
    });
    afterEach(() => temp.cleanup());

    it.each(builtInTemplates.flatMap((id) => examples.map(({ name }) => [id, name])))(
      '%s renders %s into a one-page PDF',
      async (id, example) => {
        const output = path.join(temp.dir, `${id}-${example}.pdf`);
        const result = spawnSync(
          typst,
          [
            'compile',
            path.join(TEMPLATES_DIR, id, 'template.typ'),
            output,
            '--root',
            TEMPLATES_DIR,
            '--input',
            `data=/examples/${example}`,
            '--font-path',
            path.join(TEMPLATES_DIR, 'fonts'),
            '--ignore-system-fonts',
          ],
          { encoding: 'utf8' },
        );
        expect(result.stderr).toBe('');
        expect(result.status).toBe(0);

        const pdf = await PDFDocument.load(fs.readFileSync(output));
        const data = examples.find(({ name }) => name === example)?.data as TemplateData;
        expect(pdf.getPageCount()).toBe(1);
        expect(pdf.getTitle()).toBe(`${data.basics.name} — CV`);
      },
    );
  });
});
