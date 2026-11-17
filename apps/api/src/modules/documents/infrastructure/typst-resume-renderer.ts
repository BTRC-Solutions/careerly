import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { TemplateData } from '@careerly/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { APP_CONFIG, type AppConfig } from '../../../platform/config/app-config.js';
import {
  RenderError,
  type RenderOutput,
  ResumeRenderer,
  type ResumeTemplate,
} from '../application/documents.ports.js';

const run = promisify(execFile);

/** Typst's diagnostics are kept for the template's author, up to this length. */
const MAX_DIAGNOSTICS = 4000;

/**
 * Renders with the Typst CLI as a child process (ADR-14, ARCHITECTURE.md §9). Each render gets its own
 * temporary folder holding a copy of the template and `data.json`. That folder is Typst's `--root`, so a
 * template reads nothing else. Only the packaged fonts are available, the process is killed after
 * `renderTimeoutMs`, and the folder is deleted afterwards.
 *
 * Pages are counted on the resulting PDF (ADR-07): it works with any template, needs no second compilation
 * (`typst query`) and counts exactly what the user gets.
 */
@Injectable()
export class TypstResumeRenderer extends ResumeRenderer {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
  }

  async render(template: ResumeTemplate, data: TemplateData): Promise<RenderOutput> {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'careerly-render-'));
    try {
      await fs.cp(template.dir, work, { recursive: true });
      // Data, not code: the template reads this file (RNF-05).
      await fs.writeFile(path.join(work, 'data.json'), JSON.stringify(data));
      await this.compile(work);
      const pdf = new Uint8Array(await fs.readFile(path.join(work, 'resume.pdf')));
      return { pdf, pageCount: await countPages(pdf) };
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }

  private async compile(work: string): Promise<void> {
    const packages = this.config.typstPackagesDir;
    try {
      await run(
        this.config.typstBinary,
        [
          'compile',
          'template.typ',
          'resume.pdf',
          '--root',
          work,
          '--font-path',
          path.join(this.config.templatesDir, 'fonts'),
          '--ignore-system-fonts',
          '--package-path',
          path.join(packages, 'local'),
          '--package-cache-path',
          path.join(packages, 'cache'),
        ],
        {
          cwd: work,
          timeout: this.config.renderTimeoutMs,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        },
      );
    } catch (error) {
      throw toRenderError(error as ExecError, this.config.renderTimeoutMs, work);
    }
  }
}

async function countPages(pdf: Uint8Array): Promise<number> {
  try {
    return (await PDFDocument.load(pdf, { updateMetadata: false })).getPageCount();
  } catch {
    throw new RenderError('COMPILE_ERROR', 'The renderer produced an unreadable PDF.');
  }
}

type ExecError = NodeJS.ErrnoException & { killed?: boolean; stderr?: string };

function toRenderError(error: ExecError, timeoutMs: number, work: string): RenderError {
  if (error.code === 'ENOENT') {
    return new RenderError('RENDERER_UNAVAILABLE', 'The Typst CLI was not found.');
  }
  if (error.killed) {
    return new RenderError('TIMEOUT', `The template took more than ${timeoutMs} ms to render.`);
  }
  const stderr = withoutWorkFolder(error.stderr ?? '', work);
  const diagnostics = stderr.trim().slice(0, MAX_DIAGNOSTICS) || null;
  return new RenderError('COMPILE_ERROR', 'The template could not be rendered.', diagnostics);
}

/**
 * Typst names files by their absolute path (on Windows with the `\\?\` prefix). The temporary folder means
 * nothing to the template's author, so `…/careerly-render-x/template.typ` becomes `template.typ`.
 */
function withoutWorkFolder(text: string, work: string): string {
  const folder = `${work}${path.sep}`;
  return text.replaceAll(`\\\\?\\${folder}`, '').replaceAll(folder, '');
}
