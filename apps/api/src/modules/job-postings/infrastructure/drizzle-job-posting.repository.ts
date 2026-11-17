import { type JobPosting, JobPostingSchema } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { jobPostings } from '../../../platform/database/schema.js';
import { JobPostingRepository } from '../application/job-postings.repository.js';

type Row = typeof jobPostings.$inferSelect;

@Injectable()
export class DrizzleJobPostingRepository extends JobPostingRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async insert(posting: JobPosting): Promise<void> {
    await this.database.db.insert(jobPostings).values(toRow(posting));
  }

  async list(): Promise<JobPosting[]> {
    const rows = await this.database.db
      .select()
      .from(jobPostings)
      .orderBy(desc(jobPostings.createdAt));
    return rows.map(toPosting);
  }

  async findById(id: string): Promise<JobPosting | null> {
    const [row] = await this.database.db.select().from(jobPostings).where(eq(jobPostings.id, id));
    return row ? toPosting(row) : null;
  }

  async update(posting: JobPosting): Promise<void> {
    const { id, ...values } = toRow(posting);
    await this.database.db.update(jobPostings).set(values).where(eq(jobPostings.id, id));
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.database.db
      .delete(jobPostings)
      .where(eq(jobPostings.id, id))
      .returning({ id: jobPostings.id });
    return deleted.length > 0;
  }
}

function toRow(posting: JobPosting): Row {
  return {
    id: posting.id,
    title: posting.title,
    company: posting.company,
    url: posting.url,
    location: posting.location,
    workMode: posting.workMode,
    salaryMin: posting.salary?.min ?? null,
    salaryMax: posting.salary?.max ?? null,
    salaryCurrency: posting.salary?.currency ?? null,
    salaryPeriod: posting.salary?.period ?? null,
    text: posting.text,
    createdAt: posting.createdAt,
    updatedAt: posting.updatedAt,
  };
}

/** Rows are validated on the way out, like every read of the database. */
function toPosting(row: Row): JobPosting {
  const hasSalary = row.salaryMin !== null || row.salaryMax !== null;
  return JobPostingSchema.parse({
    id: row.id,
    title: row.title,
    company: row.company,
    url: row.url,
    location: row.location,
    workMode: row.workMode,
    salary: hasSalary
      ? {
          min: row.salaryMin,
          max: row.salaryMax,
          currency: row.salaryCurrency,
          period: row.salaryPeriod,
        }
      : null,
    text: row.text,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
