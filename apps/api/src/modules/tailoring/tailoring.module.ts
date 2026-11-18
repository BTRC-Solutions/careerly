import { Module } from '@nestjs/common';
import { JobPostingsModule } from '../job-postings/index.js';
import { JobsModule } from '../jobs/index.js';
import { ProfileModule } from '../profile/index.js';
import { GapsService } from './application/gaps.service.js';
import { TailoringSessionsService } from './application/tailoring-sessions.service.js';
import {
  GapQuestionRepository,
  JobDescriptionReader,
  MatchQueue,
  ProfileReader,
  RequirementMatcher,
  TailoringSessionRepository,
  ToolResolver,
} from './application/tailoring.ports.js';
import { TailoringController } from './http/tailoring.controller.js';
import { DrizzleGapQuestionRepository } from './infrastructure/drizzle-gap-question.repository.js';
import { DrizzleTailoringSessionRepository } from './infrastructure/drizzle-tailoring-session.repository.js';
import { LlmRequirementMatcher } from './infrastructure/llm-requirement-matcher.js';
import {
  CatalogToolResolver,
  JobPostingsModuleReader,
  JobQueueMatchQueue,
  ProfileModuleReader,
  TailoringMatchJobHandler,
} from './infrastructure/module-adapters.js';

/**
 * Tailoring sessions (ARCHITECTURE §4–5, hexagonal): from a job description and the master profile to the
 * tailored CVs. So far: starting a session and matching its requirements (RF-TAIL-01, RF-TAIL-02).
 */
@Module({
  imports: [JobsModule, ProfileModule, JobPostingsModule],
  controllers: [TailoringController],
  providers: [
    TailoringSessionsService,
    GapsService,
    TailoringMatchJobHandler,
    { provide: TailoringSessionRepository, useClass: DrizzleTailoringSessionRepository },
    { provide: GapQuestionRepository, useClass: DrizzleGapQuestionRepository },
    { provide: ProfileReader, useClass: ProfileModuleReader },
    { provide: JobDescriptionReader, useClass: JobPostingsModuleReader },
    { provide: ToolResolver, useClass: CatalogToolResolver },
    { provide: RequirementMatcher, useClass: LlmRequirementMatcher },
    { provide: MatchQueue, useClass: JobQueueMatchQueue },
  ],
})
export class TailoringModule {}
