import { Module } from '@nestjs/common';
import { JobPostingsModule } from '../job-postings/index.js';
import { TailoringModule } from '../tailoring/index.js';
import {
  ApplicationRepository,
  ContactRepository,
  FinalizedResumesReader,
  JobPostingReader,
} from './application/applications.ports.js';
import { ApplicationsService } from './application/applications.service.js';
import { ApplicationsUsageService } from './application/applications-usage.service.js';
import { ApplicationsController } from './http/applications.controller.js';
import {
  ApplicationDeletionCheck,
  JobPostingsModuleReader,
  TailoringModuleFinalizedResumes,
} from './infrastructure/module-adapters.js';
import { SqliteApplicationRepository } from './infrastructure/sqlite-application.repository.js';
import { SqliteContactRepository } from './infrastructure/sqlite-contact.repository.js';

/**
 * Job applications (ARCHITECTURE §4–5, hexagonal): one per job description, its state machine (roadmap 7.2)
 * the finalized CVs sent with it (roadmap 7.3), its timeline (roadmap 7.5), and its contacts and extra data
 * (roadmap 7.6).
 */
@Module({
  imports: [JobPostingsModule, TailoringModule],
  controllers: [ApplicationsController],
  providers: [
    ApplicationsService,
    ApplicationsUsageService,
    ApplicationDeletionCheck,
    { provide: ApplicationRepository, useClass: SqliteApplicationRepository },
    { provide: ContactRepository, useClass: SqliteContactRepository },
    { provide: JobPostingReader, useClass: JobPostingsModuleReader },
    { provide: FinalizedResumesReader, useClass: TailoringModuleFinalizedResumes },
  ],
  exports: [ApplicationsUsageService],
})
export class ApplicationsModule {}
