import { Module } from '@nestjs/common';
import { JobPostingRepository } from './application/job-postings.repository.js';
import { JobPostingsService } from './application/job-postings.service.js';
import { JobPostingsController } from './http/job-postings.controller.js';
import { DrizzleJobPostingRepository } from './infrastructure/drizzle-job-posting.repository.js';

/** Job descriptions and, from step 4.5, their structured analysis (ARCHITECTURE §4). */
@Module({
  controllers: [JobPostingsController],
  providers: [
    JobPostingsService,
    { provide: JobPostingRepository, useClass: DrizzleJobPostingRepository },
  ],
  exports: [JobPostingsService],
})
export class JobPostingsModule {}
