import {
  CLOSED_SESSION_STATUSES,
  type TailoringSession,
  TailoringSessionSchema,
} from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { and, desc, eq, notInArray, type SQL } from 'drizzle-orm';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { tailoringSessions } from '../../../platform/database/schema.js';
import { TailoringSessionRepository } from '../application/tailoring.ports.js';

type Row = typeof tailoringSessions.$inferSelect;

@Injectable()
export class DrizzleTailoringSessionRepository extends TailoringSessionRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async save(session: TailoringSession): Promise<void> {
    const row = toRow(session);
    const { id: _id, createdAt: _createdAt, ...changes } = row;
    await this.database.db
      .insert(tailoringSessions)
      .values(row)
      .onConflictDoUpdate({ target: tailoringSessions.id, set: changes });
  }

  async find(id: string): Promise<TailoringSession | null> {
    const [row] = await this.database.db
      .select()
      .from(tailoringSessions)
      .where(eq(tailoringSessions.id, id));
    return row ? toSession(row) : null;
  }

  async list(filter: { jobPostingId?: string; open?: boolean }): Promise<TailoringSession[]> {
    const conditions: SQL[] = [];
    if (filter.jobPostingId)
      conditions.push(eq(tailoringSessions.jobPostingId, filter.jobPostingId));
    if (filter.open) {
      conditions.push(notInArray(tailoringSessions.status, [...CLOSED_SESSION_STATUSES]));
    }
    const rows = await this.database.db
      .select()
      .from(tailoringSessions)
      .where(and(...conditions))
      .orderBy(desc(tailoringSessions.updatedAt));
    return rows.map(toSession);
  }
}

function toRow(session: TailoringSession): Row {
  return {
    id: session.id,
    jobPostingId: session.jobPostingId,
    languages: JSON.stringify(session.languages),
    pageBudget: session.pageBudget,
    templateId: session.templateId,
    status: session.status,
    failedStep: session.failedStep,
    match: session.match === null ? null : JSON.stringify(session.match),
    regeneration: session.regeneration === null ? null : JSON.stringify(session.regeneration),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

/** Rows (and their JSON columns) are validated on the way out. */
function toSession(row: Row): TailoringSession {
  return TailoringSessionSchema.parse({
    ...row,
    languages: JSON.parse(row.languages) as unknown,
    match: row.match === null ? null : (JSON.parse(row.match) as unknown),
    regeneration: row.regeneration === null ? null : (JSON.parse(row.regeneration) as unknown),
  });
}
