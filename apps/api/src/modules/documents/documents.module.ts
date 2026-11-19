import { Module } from '@nestjs/common';
import {
  ResumeRenderer,
  ResumeVersionFileStore,
  ResumeVersionRepository,
  TemplateCatalog,
  TemplateStarterKit,
  UserTemplateStore,
} from './application/documents.ports.js';
import { ResumeRenderService } from './application/resume-render.service.js';
import { ResumeVersionsService } from './application/resume-versions.service.js';
import { TemplateExamplesService } from './application/template-examples.service.js';
import { UserTemplatesService } from './application/user-templates.service.js';
import { ResumeVersionsController } from './http/resume-versions.controller.js';
import { TemplatesController } from './http/templates.controller.js';
import { FileResumeVersionStore } from './infrastructure/file-resume-version-store.js';
import { SqliteResumeVersionRepository } from './infrastructure/sqlite-resume-version.repository.js';
import { FileTemplateCatalog } from './infrastructure/file-template-catalog.js';
import { FileUserTemplateStore } from './infrastructure/file-user-template-store.js';
import { ZipTemplateStarterKit } from './infrastructure/zip-template-starter-kit.js';
import { TypstResumeRenderer } from './infrastructure/typst-resume-renderer.js';

/**
 * CV templates and rendering with Typst (ARCHITECTURE.md §9): the built-in templates (step 3.3) and the
 * user's own `.typ` files (roadmaps 4.12 and 4.13, ADR-24),
 * and the finalized CVs (roadmap 7.1, RF-TAIL-14).
 */
@Module({
  controllers: [TemplatesController, ResumeVersionsController],
  providers: [
    ResumeRenderService,
    ResumeVersionsService,
    UserTemplatesService,
    TemplateExamplesService,
    { provide: TemplateCatalog, useClass: FileTemplateCatalog },
    { provide: UserTemplateStore, useClass: FileUserTemplateStore },
    { provide: ResumeRenderer, useClass: TypstResumeRenderer },
    { provide: ResumeVersionRepository, useClass: SqliteResumeVersionRepository },
    { provide: ResumeVersionFileStore, useClass: FileResumeVersionStore },
    { provide: TemplateStarterKit, useClass: ZipTemplateStarterKit },
  ],
  exports: [ResumeRenderService, ResumeVersionsService],
})
export class DocumentsModule {}
