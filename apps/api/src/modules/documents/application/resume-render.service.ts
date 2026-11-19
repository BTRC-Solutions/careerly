import type { ResumeDocument } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { toTemplateData } from '../domain/resume-labels.js';
import { ResumeRenderer, TemplateCatalog, TemplateNotFoundError } from './documents.ports.js';

/** The template used when none is chosen: the built-in `classic` (RF-TAIL-09). */
export const DEFAULT_TEMPLATE_ID = 'classic';

export interface RenderedResume {
  pdf: Uint8Array;
  pageCount: number;
  templateId: string;
  templateVersion: number;
}

/** Renders a CV with a template; the fixed texts in the CV's language are added here. */
@Injectable()
export class ResumeRenderService {
  constructor(
    private readonly templates: TemplateCatalog,
    private readonly renderer: ResumeRenderer,
  ) {}

  /** Whether `templateId` is a template that can be rendered (built in or the user's). */
  async hasTemplate(templateId: string): Promise<boolean> {
    try {
      await this.templates.get(templateId);
      return true;
    } catch (error) {
      if (error instanceof TemplateNotFoundError) return false;
      throw error;
    }
  }

  async render(
    document: ResumeDocument,
    templateId: string = DEFAULT_TEMPLATE_ID,
  ): Promise<RenderedResume> {
    const template = await this.templates.get(templateId);
    const output = await this.renderer.render(template, toTemplateData(document));
    return { ...output, templateId: template.id, templateVersion: template.version };
  }
}
