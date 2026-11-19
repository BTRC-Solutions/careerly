import { randomBytes } from 'node:crypto';
import type { TemplateSummary } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import {
  type ResumeTemplate,
  ResumeRenderer,
  ResumeVersionRepository,
  TemplateCatalog,
  UserTemplateError,
  UserTemplateStore,
} from './documents.ports.js';

/**
 * The user's own CV templates (RF-TAIL-09, ADR-24, roadmap 4.12). A new `.typ` is stored only after it renders
 * every shared example (ES and EN); otherwise it is removed and the Typst error goes back to the user.
 */
@Injectable()
export class UserTemplatesService {
  constructor(
    private readonly catalog: TemplateCatalog,
    private readonly store: UserTemplateStore,
    private readonly renderer: ResumeRenderer,
    private readonly versions: ResumeVersionRepository,
  ) {}

  async list(): Promise<TemplateSummary[]> {
    const [templates, usage] = await Promise.all([
      this.catalog.list(),
      this.versions.countByTemplate(),
    ]);
    return templates.map((template) => toSummary(template, usage.get(template.id) ?? 0));
  }

  /** Throws {@link UserTemplateError} for a file that is not text, and `RenderError` for one that does not render. */
  async upload(file: Buffer, name: string): Promise<TemplateSummary> {
    const source = readTypstSource(file);
    const id = `custom-${randomBytes(4).toString('hex')}`;
    const examples = await this.catalog.examples();
    if (examples.length === 0) throw new Error('There are no examples to validate templates with.');
    const template = await this.store.stage(id, name, source);
    try {
      for (const data of examples) {
        await this.renderer.render(template, data);
      }
      await this.store.publish(template);
    } catch (error) {
      await this.store.delete(id);
      throw error;
    }
    return toSummary(template, 0);
  }

  async rename(id: string, name: string): Promise<TemplateSummary> {
    await this.requireUserTemplate(id);
    await this.store.rename(id, name);
    const usage = await this.versions.countByTemplate();
    return toSummary(await this.catalog.get(id), usage.get(id) ?? 0);
  }

  /**
   * Deletes the template with all its versions. The finalized CVs made with it keep their own copy
   * (`files/snapshots/<id>/template.typ`), so they do not change (RNF-10).
   */
  async delete(id: string): Promise<void> {
    await this.requireUserTemplate(id);
    await this.store.delete(id);
  }

  /** Throws `TemplateNotFoundError` for an unknown id and `UserTemplateError` for a built-in one. */
  private async requireUserTemplate(id: string): Promise<void> {
    const template = await this.catalog.get(id);
    if (template.builtIn) {
      throw new UserTemplateError(
        'BUILT_IN',
        `"${template.name}" is built in and cannot be changed.`,
      );
    }
  }
}

/** A template is plain text: UTF-8 without NUL bytes. Its content is never executed, only compiled (RNF-05). */
function readTypstSource(file: Buffer): string {
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(file);
  } catch {
    throw new UserTemplateError('INVALID_FILE', 'The template must be a UTF-8 text file.');
  }
  if (source.includes('\u0000')) {
    throw new UserTemplateError('INVALID_FILE', 'The template must be a UTF-8 text file.');
  }
  return source;
}

function toSummary(template: ResumeTemplate, finalizedResumes: number): TemplateSummary {
  const { id, name, version, builtIn } = template;
  return { id, name, version, builtIn, finalizedResumes };
}
