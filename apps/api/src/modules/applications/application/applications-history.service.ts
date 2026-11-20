import type { ApplicationStatus } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { ApplicationRepository } from './applications.ports.js';

/** The history of one application for the dashboard: only its states and dates. */
export interface ApplicationHistory {
  status: ApplicationStatus;
  /** The day it was sent (YYYY-MM-DD), or `null` if it was not. */
  appliedAt: string | null;
  /** Its changes of state, creation included, oldest first. */
  statusChanges: { to: ApplicationStatus; occurredAt: string }[];
}

/**
 * The states each application went through, for the dashboard (RF-DASH-01, RF-DASH-02, roadmap 8.1). Never its
 * job, contacts, notes, salaries or anything the user wrote.
 */
@Injectable()
export class ApplicationsHistoryService {
  constructor(private readonly applications: ApplicationRepository) {}

  async histories(): Promise<ApplicationHistory[]> {
    const [applications, changes] = await Promise.all([
      this.applications.list(),
      this.applications.statusChanges(),
    ]);
    const byApplication = new Map<string, ApplicationHistory['statusChanges']>();
    for (const { applicationId, to, occurredAt } of changes) {
      const list = byApplication.get(applicationId) ?? [];
      list.push({ to, occurredAt });
      byApplication.set(applicationId, list);
    }
    return applications.map(({ id, status, appliedAt }) => ({
      status,
      appliedAt,
      statusChanges: byApplication.get(id) ?? [],
    }));
  }
}
