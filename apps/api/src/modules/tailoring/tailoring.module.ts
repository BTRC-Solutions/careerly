import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/index.js';
import { JobPostingsModule } from '../job-postings/index.js';
import { JobsModule } from '../jobs/index.js';
import { ProfileModule } from '../profile/index.js';
import { TailoringSessionsService } from './application/tailoring-sessions.service.js';
import {
  GenerateQueue,
  JobDescriptionReader,
  MatchQueue,
  ProfileReader,
  RequirementMatcher,
  ResumePdfRenderer,
  ResumeWriter,
  TailoredResumeRepository,
  TailoringSessionRepository,
  ToolResolver,
  ToolVocabulary,
} from './application/tailoring.ports.js';
import { TailoringController } from './http/tailoring.controller.js';
import { DrizzleTailoredResumeRepository } from './infrastructure/drizzle-tailored-resume.repository.js';
import { DrizzleTailoringSessionRepository } from './infrastructure/drizzle-tailoring-session.repository.js';
import { LlmRequirementMatcher } from './infrastructure/llm-requirement-matcher.js';
import { LlmResumeWriter } from './infrastructure/llm-resume-writer.js';
import {
  CatalogToolResolver,
  CatalogToolVocabulary,
  DocumentsModuleRenderer,
  JobPostingsModuleReader,
  JobQueueGenerateQueue,
  JobQueueMatchQueue,
  ProfileModuleReader,
  TailoringGenerateJobHandler,
  TailoringMatchJobHandler,
} from './infrastructure/module-adapters.js';

/**
 * Tailoring sessions (ARCHITECTURE §4–5, hexagonal): from a job description and the master profile to the
 * tailored CVs. So far: starting a session, matching its requirements and writing one CV per language
 * (RF-TAIL-01, RF-TAIL-02, RF-TAIL-10, RF-TAIL-11).
 */
@Module({
  imports: [JobsModule, ProfileModule, JobPostingsModule, DocumentsModule],
  controllers: [TailoringController],
  providers: [
    TailoringSessionsService,
    TailoringMatchJobHandler,
    TailoringGenerateJobHandler,
    { provide: TailoringSessionRepository, useClass: DrizzleTailoringSessionRepository },
    { provide: ProfileReader, useClass: ProfileModuleReader },
    { provide: JobDescriptionReader, useClass: JobPostingsModuleReader },
    { provide: ToolResolver, useClass: CatalogToolResolver },
    { provide: ToolVocabulary, useClass: CatalogToolVocabulary },
    { provide: RequirementMatcher, useClass: LlmRequirementMatcher },
    { provide: MatchQueue, useClass: JobQueueMatchQueue },
    { provide: GenerateQueue, useClass: JobQueueGenerateQueue },
    { provide: ResumeWriter, useClass: LlmResumeWriter },
    { provide: TailoredResumeRepository, useClass: DrizzleTailoredResumeRepository },
    { provide: ResumePdfRenderer, useClass: DocumentsModuleRenderer },
  ],
})
export class TailoringModule {}
