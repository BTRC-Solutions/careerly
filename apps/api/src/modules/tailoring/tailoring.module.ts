import { Module } from '@nestjs/common';
import { JobPostingsModule } from '../job-postings/index.js';
import { JobsModule } from '../jobs/index.js';
import { ProfileModule } from '../profile/index.js';
import { SessionProfileChangesService } from './application/session-profile-changes.service.js';
import { TailoringSessionsService } from './application/tailoring-sessions.service.js';
import {
  JobDescriptionReader,
  MatchQueue,
  ProfileChangeLog,
  ProfileReader,
  RequirementMatcher,
  TailoringSessionRepository,
  ToolResolver,
} from './application/tailoring.ports.js';
import { TailoringController } from './http/tailoring.controller.js';
import { DrizzleTailoringSessionRepository } from './infrastructure/drizzle-tailoring-session.repository.js';
import { LlmRequirementMatcher } from './infrastructure/llm-requirement-matcher.js';
import {
  CatalogToolResolver,
  JobPostingsModuleReader,
  JobQueueMatchQueue,
  ProfileModuleChangeLog,
  ProfileModuleReader,
  TailoringMatchJobHandler,
} from './infrastructure/module-adapters.js';

/**
 * Tailoring sessions (ARCHITECTURE §4–5, hexagonal): from a job description and the master profile to the
 * tailored CVs. So far: starting a session, matching its requirements and undoing its profile changes (RF-TAIL-01, RF-TAIL-02,
 * RF-TAIL-06).
 */
@Module({
  imports: [JobsModule, ProfileModule, JobPostingsModule],
  controllers: [TailoringController],
  providers: [
    TailoringSessionsService,
    SessionProfileChangesService,
    TailoringMatchJobHandler,
    { provide: TailoringSessionRepository, useClass: DrizzleTailoringSessionRepository },
    { provide: ProfileReader, useClass: ProfileModuleReader },
    { provide: JobDescriptionReader, useClass: JobPostingsModuleReader },
    { provide: ToolResolver, useClass: CatalogToolResolver },
    { provide: RequirementMatcher, useClass: LlmRequirementMatcher },
    { provide: MatchQueue, useClass: JobQueueMatchQueue },
    { provide: ProfileChangeLog, useClass: ProfileModuleChangeLog },
  ],
})
export class TailoringModule {}
