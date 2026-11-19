import { ACTIVE_APPLICATION_STATUSES, ApplicationStatusSchema } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { applications, sentResumes } from '../../../platform/database/schema.js';
import { inTransaction } from '../../../platform/database/sqlite.js';
import {
  ApplicationRepository,
  type StoredApplication,
} from '../application/applications.ports.js';

type Row = typeof applications.$inferSelect;
type SentRow = typeof sentResumes.$inferSelect;

const GhostedFromSchema = z.enum(ACTIVE_APPLICATION_STATUSES).nullable();

/**
 * Applications and their sent CVs. Saving writes both in one `node:sqlite` transaction (the Drizzle proxy driver
 * has none); sent CVs are only added, never changed. Reads go through Drizzle and are validated.
 */
@Injectable()
export class SqliteApplicationRepository extends ApplicationRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async save(application: StoredApplication): Promise<void> {
    const db = this.database.connection;
    inTransaction(db, () => {
      db.prepare(
        `INSERT INTO applications (id, job_posting_id, status, ghosted_from, applied_at,
           sent_without_careerly_cv, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET status = excluded.status, ghosted_from = excluded.ghosted_from,
           applied_at = excluded.applied_at, sent_without_careerly_cv = excluded.sent_without_careerly_cv,
           updated_at = excluded.updated_at`,
      ).run(
        application.id,
        application.jobPostingId,
        application.status,
        application.ghostedFrom,
        application.appliedAt,
        application.sentWithoutCareerlyCv ? 1 : 0,
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
    });
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
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });
  }
}

const pad = (n: number) => String(n).padStart(3, '0');
