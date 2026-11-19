import { Module } from '@nestjs/common';
import { JobPostingsModule } from '../job-postings/index.js';
import { TailoringModule } from '../tailoring/index.js';
import {
  ApplicationRepository,
  FinalizedResumesReader,
  JobPostingReader,
} from './application/applications.ports.js';
import { ApplicationsService } from './application/applications.service.js';
import { ApplicationsController } from './http/applications.controller.js';
import {
  ApplicationDeletionCheck,
  JobPostingsModuleReader,
  TailoringModuleFinalizedResumes,
} from './infrastructure/module-adapters.js';
import { SqliteApplicationRepository } from './infrastructure/sqlite-application.repository.js';

/**
 * Job applications (ARCHITECTURE §4–5, hexagonal): one per job description, its state machine (roadmap 7.2)
 * and the finalized CVs sent with it (roadmap 7.3). The timeline, contacts and extra data come in 7.5 and 7.6.
 */
@Module({
  imports: [JobPostingsModule, TailoringModule],
  controllers: [ApplicationsController],
  providers: [
    ApplicationsService,
    ApplicationDeletionCheck,
    { provide: ApplicationRepository, useClass: SqliteApplicationRepository },
    { provide: JobPostingReader, useClass: JobPostingsModuleReader },
    { provide: FinalizedResumesReader, useClass: TailoringModuleFinalizedResumes },
  ],
})
export class ApplicationsModule {}
