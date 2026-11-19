import { type TailoredResume, TailoredResumeSchema } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { tailoredResumes } from '../../../platform/database/schema.js';
import { TailoredResumeRepository } from '../application/tailoring.ports.js';

type Row = typeof tailoredResumes.$inferSelect;

@Injectable()
export class DrizzleTailoredResumeRepository extends TailoredResumeRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async save(resume: TailoredResume): Promise<void> {
    const row: Row = {
      sessionId: resume.sessionId,
      language: resume.language,
      data: JSON.stringify(resume.data),
      promptVersion: resume.promptVersion,
      model: resume.model,
      generatedAt: resume.generatedAt,
    };
    const { sessionId: _sessionId, language: _language, ...changes } = row;
    await this.database.db
      .insert(tailoredResumes)
      .values(row)
      .onConflictDoUpdate({
        target: [tailoredResumes.sessionId, tailoredResumes.language],
        set: changes,
      });
  }

  async list(sessionId: string): Promise<TailoredResume[]> {
    const rows = await this.database.db
      .select()
      .from(tailoredResumes)
      .where(eq(tailoredResumes.sessionId, sessionId));
    // Rows (and their JSON column) are validated on the way out.
    return rows.map((row) =>
      TailoredResumeSchema.parse({ ...row, data: JSON.parse(row.data) as unknown }),
    );
  }
}
