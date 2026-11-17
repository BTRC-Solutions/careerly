import { type JobAnalysis, JobAnalysisSchema } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { jobAnalyses, jobRequirements } from '../../../platform/database/schema.js';
import { inTransaction } from '../../../platform/database/sqlite.js';
import { JobAnalysisRepository } from '../application/job-analysis.ports.js';

/**
 * Analyses and their requirements. Saving replaces both in one `node:sqlite` transaction (the Drizzle proxy
 * driver has none); reads go through Drizzle and are validated.
 */
@Injectable()
export class SqliteJobAnalysisRepository extends JobAnalysisRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  save(analysis: JobAnalysis): void {
    const db = this.database.connection;
    inTransaction(db, () => {
      db.prepare('DELETE FROM job_requirements WHERE job_posting_id = ?').run(
        analysis.jobPostingId,
      );
      db.prepare(
        `INSERT INTO job_analyses (job_posting_id, language, role_category, seniority, work_mode, country,
           years_of_experience, keywords, prompt_version, model, analyzed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (job_posting_id) DO UPDATE SET language = excluded.language,
           role_category = excluded.role_category, seniority = excluded.seniority,
           work_mode = excluded.work_mode, country = excluded.country,
           years_of_experience = excluded.years_of_experience, keywords = excluded.keywords,
           prompt_version = excluded.prompt_version, model = excluded.model, analyzed_at = excluded.analyzed_at`,
      ).run(
        analysis.jobPostingId,
        analysis.language,
        analysis.roleCategory,
        analysis.seniority,
        analysis.workMode,
        analysis.country,
        analysis.yearsOfExperience,
        JSON.stringify(analysis.keywords),
        analysis.promptVersion,
        analysis.model,
        analysis.analyzedAt,
      );
      const insert = db.prepare(
        `INSERT INTO job_requirements (id, job_posting_id, position, label, kind, importance, tool_id, tool_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      analysis.requirements.forEach((requirement, position) =>
        insert.run(
          requirement.id,
          analysis.jobPostingId,
          position,
          requirement.label,
          requirement.kind,
          requirement.importance,
          requirement.tool?.id ?? null,
          requirement.tool?.name ?? null,
        ),
      );
    });
  }

  async find(jobPostingId: string): Promise<JobAnalysis | null> {
    const db = this.database.db;
    const [row] = await db
      .select()
      .from(jobAnalyses)
      .where(eq(jobAnalyses.jobPostingId, jobPostingId));
    if (!row) return null;
    const requirements = await db
      .select()
      .from(jobRequirements)
      .where(eq(jobRequirements.jobPostingId, jobPostingId))
      .orderBy(asc(jobRequirements.position));
    return JobAnalysisSchema.parse({
      jobPostingId: row.jobPostingId,
      language: row.language,
      roleCategory: row.roleCategory,
      seniority: row.seniority,
      workMode: row.workMode,
      country: row.country,
      yearsOfExperience: row.yearsOfExperience,
      keywords: JSON.parse(row.keywords) as unknown,
      requirements: requirements.map((requirement) => ({
        id: requirement.id,
        label: requirement.label,
        kind: requirement.kind,
        importance: requirement.importance,
        tool:
          requirement.toolId && requirement.toolName
            ? { id: requirement.toolId, name: requirement.toolName }
            : null,
      })),
      promptVersion: row.promptVersion,
      model: row.model,
      analyzedAt: row.analyzedAt,
    });
  }
}
