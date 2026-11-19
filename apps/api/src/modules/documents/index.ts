// Public API of the documents module.
export { DocumentsModule } from './documents.module.js';
export {
  RenderError,
  type RenderFailure,
  ResumeVersionNotFoundError,
  TemplateNotFoundError,
} from './application/documents.ports.js';
export {
  DEFAULT_TEMPLATE_ID,
  type RenderedResume,
  ResumeRenderService,
} from './application/resume-render.service.js';
export {
  type ResumeToFinalize,
  ResumeVersionsService,
} from './application/resume-versions.service.js';
