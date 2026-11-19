import type { ApplicationStatus } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { ApplicationRepository } from './applications.ports.js';

/** What happened to applications in a period, for telemetry. Only ids and states. */
export interface ApplicationsUsage {
  /** The job descriptions of the applications created in the period. */
  createdFor: string[];
  /** Changes of state in the period, by the state reached. Creating an application is not one. */
  transitions: Partial<Record<ApplicationStatus, number>>;
}

/**
 * Usage of applications for the telemetry metrics (RF-TEL-03b–g, roadmap 7.7): the applications created and the
 * changes of state recorded in their timelines. Never their contacts, notes, salaries or anything the user wrote.
 */
@Injectable()
export class ApplicationsUsageService {
  constructor(private readonly applications: ApplicationRepository) {}

  /** Usage in `[from, to)`, ISO instants. */
  async usageBetween(from: string, to: string): Promise<ApplicationsUsage> {
    const [createdFor, reached] = await Promise.all([
      this.applications.createdBetween(from, to),
      this.applications.statusesReachedBetween(from, to),
    ]);
    const transitions: Partial<Record<ApplicationStatus, number>> = {};
    for (const status of reached) transitions[status] = (transitions[status] ?? 0) + 1;
    return { createdFor, transitions };
  }
}
