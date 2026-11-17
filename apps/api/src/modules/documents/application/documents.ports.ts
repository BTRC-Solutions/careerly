import type { TemplateData } from '@careerly/contracts';

/** A CV template ready to render: its manifest plus the folder with `template.typ` (ARCHITECTURE.md §9). */
export interface ResumeTemplate {
  id: string;
  name: string;
  /** Goes up with every change to the template; snapshots keep it (RNF-10). */
  version: number;
  /** `true` for the templates that ship with the app; the user's own ones can be renamed and deleted. */
  builtIn: boolean;
  dir: string;
}

export class TemplateNotFoundError extends Error {
  constructor(readonly templateId: string) {
    super(`Template "${templateId}" does not exist.`);
    this.name = 'TemplateNotFoundError';
  }
}

/** Why a change to the user's templates was refused. */
export type UserTemplateFailure = 'INVALID_FILE' | 'BUILT_IN' | 'IN_USE';

export class UserTemplateError extends Error {
  constructor(
    readonly reason: UserTemplateFailure,
    message: string,
  ) {
    super(message);
    this.name = 'UserTemplateError';
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
  /** Built-in templates first, then the user's own, by name. */
  abstract list(): Promise<ResumeTemplate[]>;
  /** Throws {@link TemplateNotFoundError}. */
  abstract get(id: string): Promise<ResumeTemplate>;
  /** The shared examples, one per language: every template must render all of them (roadmap 4.12). */
  abstract examples(): Promise<TemplateData[]>;
}

/** Port: the user's own templates, stored as versioned folders under `files/templates/` (ADR-24). */
export abstract class UserTemplateStore {
  /** Only the complete ones: a folder without its metadata is ignored. */
  abstract list(): Promise<ResumeTemplate[]>;
  /**
   * Writes version 1 of a new template without listing it yet, so it can be validated first. Then
   * {@link publish} makes it available, or {@link delete} discards it.
   */
  abstract stage(id: string, name: string, source: string): Promise<ResumeTemplate>;
  /** Makes a staged template available. */
  abstract publish(template: ResumeTemplate): Promise<void>;
  abstract rename(id: string, name: string): Promise<void>;
  /** Removes the template with all its versions. */
  abstract delete(id: string): Promise<void>;
}

/**
 * Port: whether a saved snapshot uses a template version. Those templates are kept (roadmap 4.12).
 * Snapshots arrive in phase 7; until then nothing uses a template.
 */
export abstract class TemplateUsage {
  abstract isUsed(templateId: string): Promise<boolean>;
}

/** A rendered PDF and its number of pages, which the page fitter works with (ARCHITECTURE.md §8). */
export interface RenderOutput {
  pdf: Uint8Array;
  pageCount: number;
}

/** Port: turns template data into a PDF. The data is passed as JSON, never as template code (RNF-05). */
export abstract class ResumeRenderer {
  /** Throws {@link RenderError}. */
  abstract render(template: ResumeTemplate, data: TemplateData): Promise<RenderOutput>;
}
