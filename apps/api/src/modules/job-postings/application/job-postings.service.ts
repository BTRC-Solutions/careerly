import { randomUUID } from 'node:crypto';
import type {
  CreateJobPostingRequest,
  JobPosting,
  JobPostingSummary,
  UpdateJobPostingRequest,
} from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import {
  JobPostingInUseError,
  JobPostingNotFoundError,
  JobPostingRepository,
} from './job-postings.repository.js';

/**
 * Says what keeps a job description from being deleted (e.g. its application), or `null`. Other modules
 * register one, since this module cannot depend on them.
 */
export type JobPostingDeletionCheck = (jobPostingId: string) => Promise<string | null>;

/** Characters of the text shown in the list. */
const EXCERPT_LENGTH = 200;

/** Job descriptions the user pastes (RF-JD-01); their analysis comes in step 4.5. */
@Injectable()
export class JobPostingsService {
  private readonly deletionChecks: JobPostingDeletionCheck[] = [];

  constructor(private readonly postings: JobPostingRepository) {}

  /** Registers a check that runs before deleting a job description (e.g. the applications module). */
  registerDeletionCheck(check: JobPostingDeletionCheck): void {
    this.deletionChecks.push(check);
  }

  async create(request: CreateJobPostingRequest): Promise<JobPosting> {
    const now = new Date().toISOString();
    const posting: JobPosting = { id: randomUUID(), ...request, createdAt: now, updatedAt: now };
    await this.postings.insert(posting);
    return posting;
  }

  async list(): Promise<JobPostingSummary[]> {
    return (await this.postings.list()).map(({ text, ...posting }) => ({
      ...posting,
      excerpt: excerptOf(text),
    }));
  }

  async get(id: string): Promise<JobPosting> {
    const posting = await this.postings.findById(id);
    if (!posting) throw new JobPostingNotFoundError(id);
    return posting;
  }

  async update(id: string, patch: UpdateJobPostingRequest): Promise<JobPosting> {
    const updated: JobPosting = {
      ...(await this.get(id)),
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.postings.update(updated);
    return updated;
  }

  /** Throws `JobPostingInUseError` when another module keeps it (e.g. it has an application). */
  async delete(id: string): Promise<void> {
    for (const check of this.deletionChecks) {
      const usedBy = await check(id);
      if (usedBy) throw new JobPostingInUseError(id, usedBy);
    }
    if (!(await this.postings.delete(id))) throw new JobPostingNotFoundError(id);
  }
}

/** The first characters of the text on one line, cut at a word. */
export function excerptOf(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= EXCERPT_LENGTH) return flat;
  const cut = flat.slice(0, EXCERPT_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > EXCERPT_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
