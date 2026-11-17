import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/index.js';
import { ProfileModule } from '../profile/index.js';
import {
  AnalysisQueue,
  JdAnalyzer,
  JobAnalysisRepository,
  ToolMatcher,
} from './application/job-analysis.ports.js';
import { JobAnalysisService } from './application/job-analysis.service.js';
import { JobPostingRepository } from './application/job-postings.repository.js';
import { JobPostingsService } from './application/job-postings.service.js';
import { JobPostingsController } from './http/job-postings.controller.js';
import {
  CatalogToolMatcher,
  JdAnalysisJobHandler,
  JobQueueAnalysisQueue,
} from './infrastructure/analysis-adapters.js';
import { DrizzleJobPostingRepository } from './infrastructure/drizzle-job-posting.repository.js';
import { LlmJdAnalyzer } from './infrastructure/llm-jd-analyzer.js';
import { SqliteJobAnalysisRepository } from './infrastructure/sqlite-job-analysis.repository.js';

/**
 * Job descriptions (RF-JD-01) and their structured analysis (RF-JD-02), which runs as a background job
 * with the AI and matches tools to the profile's catalog (ARCHITECTURE §4).
 */
@Module({
  imports: [JobsModule, ProfileModule],
  controllers: [JobPostingsController],
  providers: [
    JobPostingsService,
    JobAnalysisService,
    JdAnalysisJobHandler,
    { provide: JobPostingRepository, useClass: DrizzleJobPostingRepository },
    { provide: JobAnalysisRepository, useClass: SqliteJobAnalysisRepository },
    { provide: JdAnalyzer, useClass: LlmJdAnalyzer },
    { provide: ToolMatcher, useClass: CatalogToolMatcher },
    { provide: AnalysisQueue, useClass: JobQueueAnalysisQueue },
  ],
  exports: [JobPostingsService, JobAnalysisService],
})
export class JobPostingsModule {}
