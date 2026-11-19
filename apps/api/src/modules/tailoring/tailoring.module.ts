import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/index.js';
import { JobPostingsModule } from '../job-postings/index.js';
import { JobsModule } from '../jobs/index.js';
import { ProfileModule } from '../profile/index.js';
import { GapsService } from './application/gaps.service.js';
import { SessionProfileChangesService } from './application/session-profile-changes.service.js';
import { RelevanceService } from './application/relevance.service.js';
import { TailoringUsageService } from './application/tailoring-usage.service.js';
import { TailoringSessionsService } from './application/tailoring-sessions.service.js';
import {
  GenerateQueue,
  GapQuestionRepository,
  JobDescriptionReader,
  MatchQueue,
  ProfileChangeLog,
  ProfileReader,
  RelevanceRepository,
  RelevanceScorer,
  ProfileWriter,
  RequirementMatcher,
  ResumePdfRenderer,
  ResumeWriter,
  TailoredResumeRepository,
  TailoringSessionRepository,
  TemplateLookup,
  ToolResolver,
  ToolVocabulary,
} from './application/tailoring.ports.js';
import { TailoringController } from './http/tailoring.controller.js';
import { DrizzleGapQuestionRepository } from './infrastructure/drizzle-gap-question.repository.js';
import { DrizzleTailoredResumeRepository } from './infrastructure/drizzle-tailored-resume.repository.js';
import { DrizzleRelevanceRepository } from './infrastructure/drizzle-relevance.repository.js';
import { DrizzleTailoringSessionRepository } from './infrastructure/drizzle-tailoring-session.repository.js';
import { LlmRelevanceScorer } from './infrastructure/llm-relevance-scorer.js';
import { LlmRequirementMatcher } from './infrastructure/llm-requirement-matcher.js';
import { LlmResumeWriter } from './infrastructure/llm-resume-writer.js';
import {
  CatalogToolResolver,
  CatalogToolVocabulary,
  DocumentsModuleRenderer,
  DocumentsTemplateLookup,
  JobPostingsModuleReader,
  JobQueueGenerateQueue,
  JobQueueMatchQueue,
  ProfileModuleChangeLog,
  ProfileModuleReader,
  TailoringGenerateJobHandler,
  ProfileModuleWriter,
  TailoringMatchJobHandler,
} from './infrastructure/module-adapters.js';

/**
 * Tailoring sessions (ARCHITECTURE §4–5, hexagonal): from a job description and the master profile to the
 * tailored CVs. So far: starting a session, matching its requirements, the gap questions and undoing its
 * profile changes, and writing one CV per language (RF-TAIL-01, RF-TAIL-02, RF-TAIL-06, RF-TAIL-10,
 * RF-TAIL-11).
 */
@Module({
  imports: [JobsModule, ProfileModule, JobPostingsModule, DocumentsModule],
  controllers: [TailoringController],
  exports: [TailoringUsageService],
  providers: [
    TailoringSessionsService,
    RelevanceService,
    GapsService,
    TailoringUsageService,
    SessionProfileChangesService,
    TailoringMatchJobHandler,
    TailoringGenerateJobHandler,
    { provide: TailoringSessionRepository, useClass: DrizzleTailoringSessionRepository },
    { provide: GapQuestionRepository, useClass: DrizzleGapQuestionRepository },
    { provide: ProfileReader, useClass: ProfileModuleReader },
    { provide: ProfileWriter, useClass: ProfileModuleWriter },
    { provide: JobDescriptionReader, useClass: JobPostingsModuleReader },
    { provide: ToolResolver, useClass: CatalogToolResolver },
    { provide: ToolVocabulary, useClass: CatalogToolVocabulary },
    { provide: RequirementMatcher, useClass: LlmRequirementMatcher },
    { provide: RelevanceScorer, useClass: LlmRelevanceScorer },
    { provide: RelevanceRepository, useClass: DrizzleRelevanceRepository },
    { provide: MatchQueue, useClass: JobQueueMatchQueue },
    { provide: ProfileChangeLog, useClass: ProfileModuleChangeLog },
    { provide: GenerateQueue, useClass: JobQueueGenerateQueue },
    { provide: ResumeWriter, useClass: LlmResumeWriter },
    { provide: TailoredResumeRepository, useClass: DrizzleTailoredResumeRepository },
    { provide: ResumePdfRenderer, useClass: DocumentsModuleRenderer },
    { provide: TemplateLookup, useClass: DocumentsTemplateLookup },
  ],
})
export class TailoringModule {}
