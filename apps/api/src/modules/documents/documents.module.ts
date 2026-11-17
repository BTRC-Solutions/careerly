import { Module } from '@nestjs/common';
import {
  ResumeRenderer,
  TemplateCatalog,
  TemplateUsage,
  UserTemplateStore,
} from './application/documents.ports.js';
import { ResumeRenderService } from './application/resume-render.service.js';
import { UserTemplatesService } from './application/user-templates.service.js';
import { TemplatesController } from './http/templates.controller.js';
import { NoTemplateUsage } from './infrastructure/no-template-usage.js';
import { FileTemplateCatalog } from './infrastructure/file-template-catalog.js';
import { FileUserTemplateStore } from './infrastructure/file-user-template-store.js';
import { TypstResumeRenderer } from './infrastructure/typst-resume-renderer.js';

/**
 * CV templates and rendering with Typst (ARCHITECTURE.md §9): the built-in templates (step 3.3) and the
 * user's own `.typ` files (roadmap 4.12, ADR-24). Snapshots (phase 7) will provide {@link TemplateUsage}.
 */
@Module({
  controllers: [TemplatesController],
  providers: [
    ResumeRenderService,
    UserTemplatesService,
    { provide: TemplateCatalog, useClass: FileTemplateCatalog },
    { provide: UserTemplateStore, useClass: FileUserTemplateStore },
    { provide: ResumeRenderer, useClass: TypstResumeRenderer },
    { provide: TemplateUsage, useClass: NoTemplateUsage },
  ],
  exports: [ResumeRenderService],
})
export class DocumentsModule {}
