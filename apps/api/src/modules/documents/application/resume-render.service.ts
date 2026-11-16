import type { ResumeDocument } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { toTemplateData } from '../domain/resume-labels.js';
import { ResumeRenderer, TemplateCatalog } from './documents.ports.js';

/** The template used when none is chosen: the built-in `classic` (RF-TAIL-09). */
export const DEFAULT_TEMPLATE_ID = 'classic';

export interface RenderedResume {
  pdf: Uint8Array;
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

  async render(
    document: ResumeDocument,
    templateId: string = DEFAULT_TEMPLATE_ID,
  ): Promise<RenderedResume> {
    const template = await this.templates.get(templateId);
    const pdf = await this.renderer.render(template, toTemplateData(document));
    return { pdf, templateId: template.id, templateVersion: template.version };
  }
}
