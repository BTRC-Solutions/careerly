import type {
  ApplicationChannel,
  ApplicationEvent,
  ApplicationPriority,
  Contact,
  ResumeVersion,
} from '@careerly/contracts';
import type { Application } from '../domain/application.js';

/** A finalized CV sent with an application, as stored. */
export interface StoredSentResume {
  resumeVersionId: string;
  /** YYYY-MM-DD. */
  sentAt: string;
}

/** An application as stored: the aggregate, its sent CVs, its extra data (roadmap 7.6) and its timestamps. */
export interface StoredApplication extends Application {
  sentResumes: StoredSentResume[];
  channel: ApplicationChannel | null;
  priority: ApplicationPriority | null;
  salaryExpected: string | null;
  salaryOffered: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The application does not exist (maps to 404). */
export class ApplicationNotFoundError extends Error {
  constructor(readonly applicationId: string) {
    super('Application not found.');
    this.name = 'ApplicationNotFoundError';
  }
}

/** The job description already has its application: there is one per job (maps to 409). */
export class ApplicationAlreadyExistsError extends Error {
  constructor(readonly existingId: string) {
    super('This job description already has an application.');
    this.name = 'ApplicationAlreadyExistsError';
  }
}

/** A CV to send is not a finalized CV of the application's job description (maps to 400). */
export class UnknownResumeVersionError extends Error {
  constructor(readonly resumeVersionId: string) {
    super('Only finalized CVs of this job description can be sent with its application.');
    this.name = 'UnknownResumeVersionError';
  }
}

/** The job description of an application does not exist (maps to 404). */
export class ApplicationJobPostingNotFoundError extends Error {
  constructor(readonly jobPostingId: string) {
    super('Job posting not found.');
    this.name = 'ApplicationJobPostingNotFoundError';
  }
}

/** Port: stored applications, their sent CVs and their timeline. Abstract classes so they can be Nest DI tokens. */
export abstract class ApplicationRepository {
  /**
   * Inserts or updates the application, adds the sent CVs it does not have yet and appends the new events of its
   * timeline, in one transaction. Events are never changed or removed (roadmap 7.5).
   */
  abstract save(application: StoredApplication, events?: ApplicationEvent[]): Promise<void>;
  /** The timeline: by when the events happened, then by when they were recorded. */
  abstract events(applicationId: string): Promise<ApplicationEvent[]>;
  abstract find(id: string): Promise<StoredApplication | null>;
  abstract findByJobPosting(jobPostingId: string): Promise<StoredApplication | null>;
  /** Most recently updated first. */
  abstract list(): Promise<StoredApplication[]>;
  /** Returns whether it existed; its sent CVs go with it (the finalized CVs themselves stay). */
  abstract delete(id: string): Promise<boolean>;
}

/** The contact does not exist in that application (maps to 404). */
export class ContactNotFoundError extends Error {
  constructor(readonly contactId: string) {
    super('Contact not found.');
    this.name = 'ContactNotFoundError';
  }
}

/** Port: the contacts of applications (roadmap 7.6, RF-APP-05). */
export abstract class ContactRepository {
  /** In the order they were added. */
  abstract list(applicationId: string): Promise<Contact[]>;
  abstract find(applicationId: string, contactId: string): Promise<Contact | null>;
  /** Inserts or updates it. */
  abstract save(applicationId: string, contact: Contact): Promise<void>;
  /** Returns whether it existed. */
  abstract delete(applicationId: string, contactId: string): Promise<boolean>;
}

/** Port: job descriptions, through the job-postings module. */
export abstract class JobPostingReader {
  /** Throws `ApplicationJobPostingNotFoundError`. */
  abstract get(id: string): Promise<{ id: string; title: string | null; company: string | null }>;
  abstract list(): Promise<{ id: string; title: string | null; company: string | null }[]>;
}

/** Port: the finalized CVs of a job description, through the tailoring module (RF-APP-02). */
export abstract class FinalizedResumesReader {
  abstract forJobPosting(jobPostingId: string): Promise<ResumeVersion[]>;
}
