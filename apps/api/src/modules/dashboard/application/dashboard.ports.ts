import type { ApplicationStatus } from '@careerly/contracts';

/** One application with its states and dates, through the applications module. */
export interface ApplicationTrack {
  status: ApplicationStatus;
  /** The day it was sent (YYYY-MM-DD), or `null`. */
  appliedAt: string | null;
  /** Oldest first; `occurredAt` is an ISO instant. */
  statusChanges: { to: ApplicationStatus; occurredAt: string }[];
}

/** Port: the applications, read only. Abstract class so it can be a Nest DI token. */
export abstract class ApplicationTracksReader {
  abstract all(): Promise<ApplicationTrack[]>;
}
