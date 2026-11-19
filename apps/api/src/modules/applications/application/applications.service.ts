import { randomUUID } from 'node:crypto';
import type {
  ActiveApplicationStatus,
  AddApplicationEventRequest,
  ApplicationEvent,
  ApplicationEventList,
  Application as ApplicationView,
  ApplicationList,
  Contact,
  ContactInput,
  ContactList,
  CreateApplicationRequest,
  ListApplicationsQuery,
  MoveApplicationRequest,
  ResumeVersion,
  ResumeVersionList,
  SendApplicationRequest,
  UpdateApplicationRequest,
} from '@careerly/contracts';
import { ContactInputSchema } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import {
  applyApplicationEvent,
  isTerminal,
  newApplication,
  type StatusChange,
} from '../domain/application.js';
import {
  ApplicationAlreadyExistsError,
  ApplicationNotFoundError,
  ApplicationRepository,
  ContactNotFoundError,
  ContactRepository,
  FinalizedResumesReader,
  JobPostingReader,
  type StoredApplication,
  UnknownResumeVersionError,
} from './applications.ports.js';

/**
 * Job applications (roadmap 7.3): one per job description (RF-APP-01), created saved or already sent, with
 * the finalized CVs of that job description that were sent (RF-APP-02). Their PDFs are the finalized ones
 * (RF-APP-08). The status changes go through the aggregate (roadmap 7.2) and are recorded in the timeline
 * (roadmap 7.5, RN-09), where the user also adds notes, interviews and messages (RF-APP-04). Nothing in the
 * timeline is edited or deleted. Its extra data and contacts (roadmap 7.6, RF-APP-05, RF-APP-07) are edited
 * freely and never leave the computer.
 */
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly applications: ApplicationRepository,
    private readonly postings: JobPostingReader,
    private readonly finalized: FinalizedResumesReader,
    private readonly contactsRepository: ContactRepository,
  ) {}

  /** Throws `ApplicationJobPostingNotFoundError` and `ApplicationAlreadyExistsError`. */
  async create(request: CreateApplicationRequest): Promise<ApplicationView> {
    await this.postings.get(request.jobPostingId);
    const existing = await this.applications.findByJobPosting(request.jobPostingId);
    if (existing) throw new ApplicationAlreadyExistsError(existing.id);

    const now = new Date().toISOString();
    const saved: StoredApplication = {
      ...newApplication({ id: randomUUID(), jobPostingId: request.jobPostingId }),
      sentResumes: [],
      channel: null,
      priority: null,
      salaryExpected: null,
      salaryOffered: null,
      createdAt: now,
      updatedAt: now,
    };
    const versions = await this.finalized.forJobPosting(request.jobPostingId);
    const created = statusEvent(
      { from: null, to: 'SAVED', backward: false, reopened: false, at: now },
      now,
    );
    const { application, change } = request.sent
      ? send(saved, request.sent, versions, now)
      : { application: saved, change: null };
    await this.applications.save(application, [created, ...statusEvents(change, now)]);
    return toView(application, versions);
  }

  /**
   * Records that the application was sent: a saved one becomes `APPLIED`; one already sent gets the new CVs
   * (e.g. the English version sent later). CVs already recorded keep their first date.
   */
  async send(id: string, request: SendApplicationRequest): Promise<ApplicationView> {
    const stored = await this.load(id);
    const versions = await this.finalized.forJobPosting(stored.jobPostingId);
    const now = new Date().toISOString();
    const { application, change } = send(stored, request, versions, now);
    await this.applications.save(application, statusEvents(change, now));
    return toView(application, versions);
  }

  /** Moves it to another state (kanban, RF-APP-03); see {@link move}. */
  async move(id: string, request: MoveApplicationRequest): Promise<ApplicationView> {
    const stored = await this.load(id);
    const versions = await this.finalized.forJobPosting(stored.jobPostingId);
    const now = new Date().toISOString();
    const { application, change } = move(stored, request, versions, now);
    await this.applications.save(application, statusEvents(change, now));
    return toView(application, versions);
  }

  /** Changes the extra data (RF-APP-07): `null` clears a field, a missing one stays as it is. */
  async update(id: string, request: UpdateApplicationRequest): Promise<ApplicationView> {
    const stored = await this.load(id);
    const application = { ...stored, ...request, updatedAt: new Date().toISOString() };
    await this.applications.save(application);
    return toView(application, await this.finalized.forJobPosting(application.jobPostingId));
  }

  /** The contacts (RF-APP-05), in the order they were added. */
  async contacts(id: string): Promise<ContactList> {
    await this.load(id);
    return { contacts: await this.contactsRepository.list(id) };
  }

  async addContact(id: string, input: ContactInput): Promise<Contact> {
    await this.load(id);
    const now = new Date().toISOString();
    const contact = {
      ...ContactInputSchema.parse(input),
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    await this.contactsRepository.save(id, contact);
    return contact;
  }

  /** Replaces what is known of a contact. Throws `ContactNotFoundError`. */
  async updateContact(id: string, contactId: string, input: ContactInput): Promise<Contact> {
    await this.load(id);
    const existing = await this.contactsRepository.find(id, contactId);
    if (!existing) throw new ContactNotFoundError(contactId);
    const contact = {
      ...existing,
      ...ContactInputSchema.parse(input),
      updatedAt: new Date().toISOString(),
    };
    await this.contactsRepository.save(id, contact);
    return contact;
  }

  async deleteContact(id: string, contactId: string): Promise<void> {
    await this.load(id);
    if (!(await this.contactsRepository.delete(id, contactId))) {
      throw new ContactNotFoundError(contactId);
    }
  }

  /** The timeline (RF-APP-04): oldest first. */
  async events(id: string): Promise<ApplicationEventList> {
    await this.load(id);
    return { events: await this.applications.events(id) };
  }

  /** Adds a note, an interview or a message to the timeline (RF-APP-04); it cannot be changed afterwards. */
  async addEvent(id: string, request: AddApplicationEventRequest): Promise<ApplicationEvent> {
    const stored = await this.load(id);
    const now = new Date().toISOString();
    const { occurredAt, ...entry } = request;
    const event: ApplicationEvent = {
      ...entry,
      id: randomUUID(),
      occurredAt: occurredAt ? new Date(occurredAt).toISOString() : now,
      createdAt: now,
    };
    await this.applications.save({ ...stored, updatedAt: now }, [event]);
    return event;
  }

  async get(id: string): Promise<ApplicationView> {
    const application = await this.load(id);
    return toView(application, await this.finalized.forJobPosting(application.jobPostingId));
  }

  /** All the applications, or the one of a job description (empty when it has none). */
  async list(query: ListApplicationsQuery): Promise<ApplicationList> {
    let stored: StoredApplication[];
    if (query.jobPostingId) {
      const one = await this.applications.findByJobPosting(query.jobPostingId);
      stored = one ? [one] : [];
    } else {
      stored = await this.applications.list();
    }
    const postings = new Map((await this.postings.list()).map((posting) => [posting.id, posting]));
    return {
      applications: stored.map((application) => {
        const posting = postings.get(application.jobPostingId);
        return {
          id: application.id,
          jobPostingId: application.jobPostingId,
          status: application.status,
          ghostedFrom: application.ghostedFrom,
          appliedAt: application.appliedAt,
          priority: application.priority,
          createdAt: application.createdAt,
          updatedAt: application.updatedAt,
          title: posting?.title ?? null,
          company: posting?.company ?? null,
        };
      }),
    };
  }

  /** The finalized CVs that can be sent with the application of a job description (RF-APP-02). */
  async sendableResumes(jobPostingId: string): Promise<ResumeVersionList> {
    await this.postings.get(jobPostingId);
    return { versions: await this.finalized.forJobPosting(jobPostingId) };
  }

  /** Deletes the application and the record of what was sent; the finalized CVs themselves stay. */
  async delete(id: string): Promise<void> {
    if (!(await this.applications.delete(id))) throw new ApplicationNotFoundError(id);
  }

  /** Whether the job description has an application, which keeps it from being deleted. */
  async hasApplication(jobPostingId: string): Promise<boolean> {
    return (await this.applications.findByJobPosting(jobPostingId)) !== null;
  }

  private async load(id: string): Promise<StoredApplication> {
    const application = await this.applications.find(id);
    if (!application) throw new ApplicationNotFoundError(id);
    return application;
  }
}

/**
 * Adds the sent CVs (only finalized ones of its job description) and, if it was only saved, moves it to
 * `APPLIED` with the day it was sent. Throws `UnknownResumeVersionError` and the aggregate's errors.
 */
function send(
  application: StoredApplication,
  request: SendApplicationRequest,
  versions: ResumeVersion[],
  now: string,
): Moved {
  const next = attach(application, request, versions, now);
  if (application.status !== 'SAVED') return { application: next, change: null };
  return transition(next, { to: 'APPLIED', sent: request }, now);
}

/** The application after a change, and the change of state for the timeline, if there was one. */
interface Moved {
  application: StoredApplication;
  change: StatusChange | null;
}

/**
 * Moves the application to another state (RF-APP-03) through the aggregate: a closed one is reopened (RN-10),
 * going back needs `confirmBackward` (RN-09), and sending it for the first time needs `sent` (or CVs it
 * already has). Throws `UnknownResumeVersionError` and the aggregate's errors.
 */
function move(
  application: StoredApplication,
  request: MoveApplicationRequest,
  versions: ResumeVersion[],
  now: string,
): Moved {
  const next = request.sent ? attach(application, request.sent, versions, now) : application;
  return transition(next, request, now);
}

function transition(
  application: StoredApplication,
  request: MoveApplicationRequest,
  now: string,
): Moved {
  const sending = {
    appliedAt: request.sent?.sentAt ?? today(),
    sentWithoutCareerlyCv: request.sent?.sentWithoutCareerlyCv,
  };
  const { application: moved, change } = applyApplicationEvent(
    application,
    isTerminal(application.status)
      ? { type: 'REOPEN', to: request.to as ActiveApplicationStatus, at: now, ...sending }
      : {
          type: 'MOVE',
          to: request.to,
          at: now,
          confirmBackward: request.confirmBackward,
          ...sending,
        },
  );
  return { application: { ...application, ...moved, updatedAt: now }, change };
}

/** The timeline event of a change of state (RN-09); `from` is `null` when the application was created. */
function statusEvent(
  change: Omit<StatusChange, 'from'> & { from: StatusChange['from'] | null },
  now: string,
): ApplicationEvent {
  return {
    type: 'STATUS_CHANGE',
    id: randomUUID(),
    from: change.from,
    to: change.to,
    backward: change.backward,
    reopened: change.reopened,
    occurredAt: change.at,
    createdAt: now,
  };
}

const statusEvents = (change: StatusChange | null, now: string): ApplicationEvent[] =>
  change ? [statusEvent(change, now)] : [];

/** Adds the sent CVs it does not have yet, only finalized ones of its job description. */
function attach(
  application: StoredApplication,
  request: SendApplicationRequest,
  versions: ResumeVersion[],
  now: string,
): StoredApplication {
  const known = new Set(versions.map((version) => version.id));
  const unknown = request.resumeVersionIds.find((id) => !known.has(id));
  if (unknown) throw new UnknownResumeVersionError(unknown);

  const sentAt = request.sentAt ?? today();
  const already = new Set(application.sentResumes.map((sent) => sent.resumeVersionId));
  const added = [...new Set(request.resumeVersionIds)]
    .filter((id) => !already.has(id))
    .map((resumeVersionId) => ({ resumeVersionId, sentAt }));
  return {
    ...application,
    sentResumes: [...application.sentResumes, ...added],
    sentResumeCount: application.sentResumes.length + added.length,
    sentWithoutCareerlyCv:
      application.sentWithoutCareerlyCv || request.sentWithoutCareerlyCv === true,
    updatedAt: now,
  };
}

/** Today in the local time zone of the computer (YYYY-MM-DD): the day the user sees. */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function toView(application: StoredApplication, versions: ResumeVersion[]): ApplicationView {
  const byId = new Map(versions.map((version) => [version.id, version]));
  return {
    id: application.id,
    jobPostingId: application.jobPostingId,
    status: application.status,
    ghostedFrom: application.ghostedFrom,
    appliedAt: application.appliedAt,
    sentWithoutCareerlyCv: application.sentWithoutCareerlyCv,
    sentResumes: application.sentResumes.flatMap(({ resumeVersionId, sentAt }) => {
      const version = byId.get(resumeVersionId);
      return version
        ? [
            {
              resumeVersionId,
              sessionId: version.sessionId,
              language: version.language,
              fileName: version.fileName,
              sentAt,
            },
          ]
        : [];
    }),
    channel: application.channel,
    priority: application.priority,
    salaryExpected: application.salaryExpected,
    salaryOffered: application.salaryOffered,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
  };
}
