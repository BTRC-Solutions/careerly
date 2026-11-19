import type { ResumeVersion, ResumeVersionData, TemplateData } from '@careerly/contracts';

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
export type UserTemplateFailure = 'INVALID_FILE' | 'BUILT_IN';

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
 * Port: the starting point for writing a template (roadmap 4.13): the default template's source and the
 * shared examples, packed as a single file to download.
 */
export abstract class TemplateStarterKit {
  /** A `.zip` with `template.typ` and `examples/example.<language>.json`. */
  abstract build(): Promise<Uint8Array>;
}

/** A finalized CV with its content (RF-TAIL-14). */
export interface StoredResumeVersion extends ResumeVersion {
  data: ResumeVersionData;
}

/** The finalized CV does not exist (maps to 404). */
export class ResumeVersionNotFoundError extends Error {
  constructor(readonly versionId: string) {
    super('Finalized CV not found.');
    this.name = 'ResumeVersionNotFoundError';
  }
}

/** Port: the finalized CVs. **Immutable**: there is no update (RNF-10). */
export abstract class ResumeVersionRepository {
  /** Inserts every version in one transaction: all of them or none. */
  abstract insertAll(versions: StoredResumeVersion[]): Promise<void>;
  /** Oldest first. */
  abstract listBySession(sessionId: string): Promise<ResumeVersion[]>;
  abstract find(id: string): Promise<StoredResumeVersion | null>;
  /** How many finalized CVs use each template, by template id. */
  abstract countByTemplate(): Promise<Map<string, number>>;
}

/** What is kept on disk for a finalized CV, so it can be opened and rendered again exactly (RNF-10). */
export interface ResumeVersionFiles {
  pdf: Uint8Array;
  /** What the template received. */
  data: TemplateData;
  /** The template it was rendered with; its source is copied. */
  template: ResumeTemplate;
}

/** Port: the files of the finalized CVs, under `files/snapshots/<id>/`. Written once, never changed. */
export abstract class ResumeVersionFileStore {
  /** Fails if the version already has files. */
  abstract write(id: string, files: ResumeVersionFiles): Promise<void>;
  abstract readPdf(id: string): Promise<Uint8Array>;
  /** Only to undo a finalization that could not be saved. */
  abstract remove(id: string): Promise<void>;
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
