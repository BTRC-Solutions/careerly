import {
  ACTIVE_APPLICATION_STATUSES,
  ApplicationChannelSchema,
  type ApplicationEvent,
  ApplicationEventSchema,
  ApplicationPrioritySchema,
  type ApplicationStatus,
  ApplicationStatusSchema,
} from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { applicationEvents, applications, sentResumes } from '../../../platform/database/schema.js';
import { inTransaction } from '../../../platform/database/sqlite.js';
import {
  ApplicationRepository,
  type StoredApplication,
  type StoredStatusChange,
} from '../application/applications.ports.js';

type Row = typeof applications.$inferSelect;
type SentRow = typeof sentResumes.$inferSelect;

const GhostedFromSchema = z.enum(ACTIVE_APPLICATION_STATUSES).nullable();
const ReachedSchema = z.object({
  from: ApplicationStatusSchema.nullable(),
  to: ApplicationStatusSchema,
});

/**
 * Applications, their sent CVs and their timeline. Saving writes them in one `node:sqlite` transaction (the
 * Drizzle proxy driver has none); sent CVs and events are only added, never changed (the migration's triggers
 * refuse it too). Reads go through Drizzle and are validated.
 */
@Injectable()
export class SqliteApplicationRepository extends ApplicationRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async save(application: StoredApplication, events: ApplicationEvent[] = []): Promise<void> {
    const db = this.database.connection;
    inTransaction(db, () => {
      db.prepare(
        `INSERT INTO applications (id, job_posting_id, status, ghosted_from, applied_at,
           sent_without_careerly_cv, channel, priority, salary_expected, salary_offered, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET status = excluded.status, ghosted_from = excluded.ghosted_from,
           applied_at = excluded.applied_at, sent_without_careerly_cv = excluded.sent_without_careerly_cv,
           channel = excluded.channel, priority = excluded.priority,
           salary_expected = excluded.salary_expected, salary_offered = excluded.salary_offered,
           updated_at = excluded.updated_at`,
      ).run(
        application.id,
        application.jobPostingId,
        application.status,
        application.ghostedFrom,
        application.appliedAt,
        application.sentWithoutCareerlyCv ? 1 : 0,
        application.channel,
        application.priority,
        application.salaryExpected,
        application.salaryOffered,
        application.createdAt,
        application.updatedAt,
      );
      const insert = db.prepare(
        `INSERT INTO sent_resumes (application_id, resume_version_id, sent_at, created_at)
         VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      );
      application.sentResumes.forEach(({ resumeVersionId, sentAt }, index) => {
        // The position keeps the order among CVs added at the same instant.
        insert.run(
          application.id,
          resumeVersionId,
          sentAt,
          `${application.updatedAt}#${pad(index)}`,
        );
      });
      const append = db.prepare(
        `INSERT INTO application_events (id, application_id, type, payload, occurred_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      events.forEach(({ id, type, occurredAt, createdAt, ...payload }, index) => {
        // The position keeps the order among events recorded at the same instant.
        append.run(
          id,
          application.id,
          type,
          JSON.stringify(payload),
          occurredAt,
          `${createdAt}#${pad(index)}`,
        );
      });
    });
  }

  async events(applicationId: string): Promise<ApplicationEvent[]> {
    const rows = await this.database.db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, applicationId))
      .orderBy(asc(applicationEvents.occurredAt), asc(applicationEvents.createdAt));
    return rows.map((row) =>
      ApplicationEventSchema.parse({
        ...(JSON.parse(row.payload) as object),
        id: row.id,
        type: row.type,
        occurredAt: row.occurredAt,
        createdAt: row.createdAt.split('#')[0],
      }),
    );
  }

  async find(id: string): Promise<StoredApplication | null> {
    const [row] = await this.database.db.select().from(applications).where(eq(applications.id, id));
    return row ? (await this.withSent([row]))[0]! : null;
  }

  async findByJobPosting(jobPostingId: string): Promise<StoredApplication | null> {
    const [row] = await this.database.db
      .select()
      .from(applications)
      .where(eq(applications.jobPostingId, jobPostingId));
    return row ? (await this.withSent([row]))[0]! : null;
  }

  async list(): Promise<StoredApplication[]> {
    const rows = await this.database.db
      .select()
      .from(applications)
      .orderBy(desc(applications.updatedAt));
    return this.withSent(rows);
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.database.db
      .delete(applications)
      .where(eq(applications.id, id))
      .returning({ id: applications.id });
    return deleted.length > 0;
  }

  async createdBetween(from: string, to: string): Promise<string[]> {
    const rows = await this.database.db
      .select({ jobPostingId: applications.jobPostingId })
      .from(applications)
      .where(and(gte(applications.createdAt, from), lt(applications.createdAt, to)));
    return rows.map((row) => row.jobPostingId);
  }

  async statusesReachedBetween(from: string, to: string): Promise<ApplicationStatus[]> {
    const rows = await this.database.db
      .select({ payload: applicationEvents.payload })
      .from(applicationEvents)
      .where(
        and(
          eq(applicationEvents.type, 'STATUS_CHANGE'),
          gte(applicationEvents.occurredAt, from),
          lt(applicationEvents.occurredAt, to),
        ),
      );
    return rows.flatMap((row) => {
      const change = ReachedSchema.parse(JSON.parse(row.payload));
      return change.from === null ? [] : [change.to];
    });
  }

  async statusChanges(): Promise<StoredStatusChange[]> {
    const rows = await this.database.db
      .select({
        applicationId: applicationEvents.applicationId,
        payload: applicationEvents.payload,
        occurredAt: applicationEvents.occurredAt,
      })
      .from(applicationEvents)
      .where(eq(applicationEvents.type, 'STATUS_CHANGE'))
      .orderBy(asc(applicationEvents.occurredAt), asc(applicationEvents.createdAt));
    return rows.map(({ applicationId, payload, occurredAt }) => ({
      applicationId,
      to: ReachedSchema.parse(JSON.parse(payload)).to,
      occurredAt,
    }));
  }

  private async withSent(rows: Row[]): Promise<StoredApplication[]> {
    if (rows.length === 0) return [];
    const sent = await this.database.db
      .select()
      .from(sentResumes)
      .where(
        inArray(
          sentResumes.applicationId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(sentResumes.createdAt));
    const byApplication = new Map<string, SentRow[]>();
    for (const row of sent) {
      byApplication.set(row.applicationId, [...(byApplication.get(row.applicationId) ?? []), row]);
    }
    return rows.map((row) => {
      const resumes = (byApplication.get(row.id) ?? []).map(({ resumeVersionId, sentAt }) => ({
        resumeVersionId,
        sentAt,
      }));
      return {
        id: row.id,
        jobPostingId: row.jobPostingId,
        status: ApplicationStatusSchema.parse(row.status),
        ghostedFrom: GhostedFromSchema.parse(row.ghostedFrom),
        appliedAt: row.appliedAt,
        sentWithoutCareerlyCv: row.sentWithoutCareerlyCv,
        sentResumeCount: resumes.length,
        sentResumes: resumes,
        channel: ApplicationChannelSchema.nullable().parse(row.channel),
        priority: ApplicationPrioritySchema.nullable().parse(row.priority),
        salaryExpected: row.salaryExpected,
        salaryOffered: row.salaryOffered,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });
  }
}

const pad = (n: number) => String(n).padStart(3, '0');
