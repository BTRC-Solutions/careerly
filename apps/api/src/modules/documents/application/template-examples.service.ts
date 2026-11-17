import type { ResumeLanguage } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { ResumeRenderer, TemplateCatalog, TemplateStarterKit } from './documents.ports.js';

/**
 * What the templates screen shows and offers (roadmap 4.13): any template rendered with the example of a
 * language, and the starting point for writing one.
 */
@Injectable()
export class TemplateExamplesService {
  constructor(
    private readonly catalog: TemplateCatalog,
    private readonly renderer: ResumeRenderer,
    private readonly starterKit: TemplateStarterKit,
  ) {}

  /** The PDF of the template with the example in `language`. Throws `TemplateNotFoundError` and `RenderError`. */
  async preview(templateId: string, language: ResumeLanguage): Promise<Uint8Array> {
    const template = await this.catalog.get(templateId);
    const example = (await this.catalog.examples()).find((data) => data.language === language);
    if (!example) throw new Error(`There is no example in "${language}".`);
    return (await this.renderer.render(template, example)).pdf;
  }

  downloadStarterKit(): Promise<Uint8Array> {
    return this.starterKit.build();
  }
}
