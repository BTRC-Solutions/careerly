import { randomUUID } from 'node:crypto';
import type { JobAnalysis, JobAnalysisState, JobProgress, JobView } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { normalizeAnalysis } from '../domain/job-analysis.js';
import {
  AnalysisQueue,
  JdAnalyzer,
  JobAnalysisRepository,
  ToolMatcher,
} from './job-analysis.ports.js';
import { JobPostingsService } from './job-postings.service.js';

/**
 * Job description analysis (RF-JD-02): runs in the background queue, so it survives closing the app.
 * Tool requirements are matched to the catalog; the result replaces the previous analysis.
 */
@Injectable()
export class JobAnalysisService {
  constructor(
    private readonly postings: JobPostingsService,
    private readonly analyzer: JdAnalyzer,
    private readonly tools: ToolMatcher,
    private readonly queue: AnalysisQueue,
    private readonly analyses: JobAnalysisRepository,
  ) {}

  /** Starts (or restarts) the analysis; returns its job. */
  async request(jobPostingId: string): Promise<JobView> {
    await this.postings.get(jobPostingId);
    return this.queue.request(jobPostingId);
  }

  async state(jobPostingId: string): Promise<JobAnalysisState> {
    await this.postings.get(jobPostingId);
    return {
      analysis: await this.analyses.find(jobPostingId),
      job: this.queue.current(jobPostingId),
    };
  }

  /** The job's work. Throws `JobPostingNotFoundError` if the posting was deleted meanwhile. */
  async run(
    jobPostingId: string,
    report: (progress: Partial<JobProgress>) => void = () => {},
  ): Promise<JobAnalysis> {
    const posting = await this.postings.get(jobPostingId);
    report({ step: 'reading' });
    const { analysis: raw, promptVersion, model } = await this.analyzer.analyze(posting);
    const analysis = normalizeAnalysis(raw);

    report({ step: 'matching', done: 0, total: analysis.requirements.length });
    const requirements = [];
    for (const requirement of analysis.requirements) {
      const tool = requirement.kind === 'TOOL' ? await this.tools.match(requirement.label) : null;
      requirements.push({ id: randomUUID(), ...requirement, tool });
    }

    const result: JobAnalysis = {
      jobPostingId,
      language: analysis.language,
      roleCategory: analysis.roleCategory,
      seniority: analysis.seniority,
      workMode: analysis.workMode,
      country: analysis.country,
      yearsOfExperience: analysis.yearsOfExperience,
      keywords: analysis.keywords,
      requirements,
      promptVersion,
      model,
      analyzedAt: new Date().toISOString(),
    };
    // The posting may have been deleted while the AI answered: its rows cascade, and saving fails.
    await this.postings.get(jobPostingId);
    this.analyses.save(result);
    return result;
  }
}
