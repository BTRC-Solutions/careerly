import type { ResumeVersion } from '@careerly/contracts';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { JobPostingNotFoundError, JobPostingsService } from '../../job-postings/index.js';
import { FinalizedResumesService } from '../../tailoring/index.js';
import { ApplicationsService } from '../application/applications.service.js';
import {
  ApplicationJobPostingNotFoundError,
  FinalizedResumesReader,
  JobPostingReader,
} from '../application/applications.ports.js';

/** Job descriptions through the job-postings module's public service. */
@Injectable()
export class JobPostingsModuleReader extends JobPostingReader {
  constructor(private readonly postings: JobPostingsService) {
    super();
  }

  async get(id: string) {
    try {
      const { title, company } = await this.postings.get(id);
      return { id, title, company };
    } catch (error) {
      if (error instanceof JobPostingNotFoundError)
        throw new ApplicationJobPostingNotFoundError(id);
      throw error;
    }
  }

  async list() {
    return (await this.postings.list()).map(({ id, title, company }) => ({ id, title, company }));
  }
}

/** Finalized CVs through the tailoring module's public service. */
@Injectable()
export class TailoringModuleFinalizedResumes extends FinalizedResumesReader {
  constructor(private readonly finalized: FinalizedResumesService) {
    super();
  }

  forJobPosting(jobPostingId: string): Promise<ResumeVersion[]> {
    return this.finalized.forJobPosting(jobPostingId);
  }
}

/** A job description with an application cannot be deleted: the application must be deleted first. */
@Injectable()
export class ApplicationDeletionCheck implements OnModuleInit {
  constructor(
    private readonly postings: JobPostingsService,
    private readonly applications: ApplicationsService,
  ) {}

  onModuleInit(): void {
    this.postings.registerDeletionCheck(async (jobPostingId) =>
      (await this.applications.hasApplication(jobPostingId)) ? 'APPLICATION' : null,
    );
  }
}
