import { Module } from '@nestjs/common';
import { ResumeRenderer, TemplateCatalog } from './application/documents.ports.js';
import { ResumeRenderService } from './application/resume-render.service.js';
import { FileTemplateCatalog } from './infrastructure/file-template-catalog.js';
import { TypstResumeRenderer } from './infrastructure/typst-resume-renderer.js';

/**
 * CV templates and rendering with Typst (ARCHITECTURE.md §9). Step 3.3: the renderer and the built-in
 * templates; page counting, snapshots and user templates come in later steps.
 */
@Module({
  providers: [
    ResumeRenderService,
    { provide: TemplateCatalog, useClass: FileTemplateCatalog },
    { provide: ResumeRenderer, useClass: TypstResumeRenderer },
  ],
  exports: [ResumeRenderService],
})
export class DocumentsModule {}
