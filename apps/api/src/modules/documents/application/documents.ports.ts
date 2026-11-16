import type { TemplateData } from '@careerly/contracts';

/** A CV template ready to render: its manifest plus the folder with `template.typ` (ARCHITECTURE.md §9). */
export interface ResumeTemplate {
  id: string;
  name: string;
  /** Goes up with every change to the template; snapshots keep it (RNF-10). */
  version: number;
  dir: string;
}

export class TemplateNotFoundError extends Error {
  constructor(readonly templateId: string) {
    super(`Template "${templateId}" does not exist.`);
    this.name = 'TemplateNotFoundError';
  }
}

/** Why a render failed: the renderer is missing, the template did not compile, or it took too long. */
export type RenderFailure = 'RENDERER_UNAVAILABLE' | 'COMPILE_ERROR' | 'TIMEOUT';

export class RenderError extends Error {
  constructor(
    readonly reason: RenderFailure,
    message: string,
    /** The renderer's own diagnostics (e.g. Typst's errors), for the template's author. Never logged. */
    readonly diagnostics: string | null = null,
  ) {
    super(message);
    this.name = 'RenderError';
  }
}

/** Port: the templates that can be rendered. Abstract classes so they can be used as Nest DI tokens. */
export abstract class TemplateCatalog {
  abstract list(): Promise<ResumeTemplate[]>;
  /** Throws {@link TemplateNotFoundError}. */
  abstract get(id: string): Promise<ResumeTemplate>;
}

/** Port: turns template data into a PDF. The data is passed as JSON, never as template code (RNF-05). */
export abstract class ResumeRenderer {
  /** Throws {@link RenderError}. */
  abstract render(template: ResumeTemplate, data: TemplateData): Promise<Uint8Array>;
}
