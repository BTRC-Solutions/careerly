import {
  type ResumeVersion,
  ResumeVersionDataSchema,
  ResumeVersionSchema,
} from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { asc, count, eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { resumeVersions } from '../../../platform/database/schema.js';
import { inTransaction } from '../../../platform/database/sqlite.js';
import {
  ResumeVersionRepository,
  type StoredResumeVersion,
} from '../application/documents.ports.js';

type Row = typeof resumeVersions.$inferSelect;

/**
 * Finalized CVs. Only inserts: the table has no update path here, and a trigger rejects any `UPDATE`
 * (RNF-10). Inserting runs in one `node:sqlite` transaction (the Drizzle proxy driver has none).
 */
@Injectable()
export class SqliteResumeVersionRepository extends ResumeVersionRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async insertAll(versions: StoredResumeVersion[]): Promise<void> {
    const db = this.database.connection;
    inTransaction(db, () => {
      const insert = db.prepare(
        `INSERT INTO resume_versions (id, session_id, language, data, template_id, template_name,
           template_version, page_count, page_budget, content_hash, file_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const version of versions) {
        insert.run(
          version.id,
          version.sessionId,
          version.language,
          JSON.stringify(version.data),
          version.templateId,
          version.templateName,
          version.templateVersion,
          version.pageCount,
          version.pageBudget,
          version.contentHash,
          version.fileName,
          version.createdAt,
        );
      }
    });
  }

  async listBySession(sessionId: string): Promise<ResumeVersion[]> {
    const rows = await this.database.db
      .select()
      .from(resumeVersions)
      .where(eq(resumeVersions.sessionId, sessionId))
      // Versions of a session share `createdAt`: then in the order they were inserted.
      .orderBy(asc(resumeVersions.createdAt), sql`rowid`);
    return rows.map(({ data: _data, ...row }) => ResumeVersionSchema.parse(row));
  }

  async find(id: string): Promise<StoredResumeVersion | null> {
    const [row] = await this.database.db
      .select()
      .from(resumeVersions)
      .where(eq(resumeVersions.id, id));
    return row ? toStored(row) : null;
  }

  async countByTemplate(): Promise<Map<string, number>> {
    const rows = await this.database.db
      .select({ templateId: resumeVersions.templateId, count: count() })
      .from(resumeVersions)
      .groupBy(resumeVersions.templateId);
    return new Map(rows.map((row) => [row.templateId, row.count]));
  }
}

/** Rows (and their JSON column) are validated on the way out. */
function toStored({ data, ...row }: Row): StoredResumeVersion {
  return {
    ...ResumeVersionSchema.parse(row),
    data: ResumeVersionDataSchema.parse(JSON.parse(data) as unknown),
  };
}
