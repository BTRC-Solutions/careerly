import type { JobPosting } from '@careerly/contracts';

/** The referenced job description does not exist (maps to 404). */
export class JobPostingNotFoundError extends Error {
  constructor(readonly jobPostingId: string) {
    super('Job posting not found.');
    this.name = 'JobPostingNotFoundError';
  }
}

/** Port: stored job descriptions. An abstract class so it can be used as a Nest DI token. */
export abstract class JobPostingRepository {
  abstract insert(posting: JobPosting): Promise<void>;
  /** Newest first. */
  abstract list(): Promise<JobPosting[]>;
  abstract findById(id: string): Promise<JobPosting | null>;
  abstract update(posting: JobPosting): Promise<void>;
  /** Returns whether it existed. */
  abstract delete(id: string): Promise<boolean>;
}

/** Another module keeps something of the job description, so it cannot be deleted (maps to 409). */
export class JobPostingInUseError extends Error {
  constructor(
    readonly jobPostingId: string,
    /** What keeps it, e.g. `APPLICATION`. */
    readonly usedBy: string,
  ) {
    super('This job description has an application; delete the application first.');
    this.name = 'JobPostingInUseError';
  }
}
