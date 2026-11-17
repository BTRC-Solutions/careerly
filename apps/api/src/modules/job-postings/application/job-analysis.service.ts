import { randomUUID } from 'node:crypto';
import type {
  JobAnalysis,
  JobAnalysisState,
  JobProgress,
  JobRequirement,
  JobView,
  UpdateJobAnalysisRequest,
} from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { normalizeAnalysis, type RawRequirement } from '../domain/job-analysis.js';
import {
  AnalysisQueue,
  JdAnalyzer,
  JobAnalysisRepository,
  ToolMatcher,
} from './job-analysis.ports.js';
import { JobPostingsService } from './job-postings.service.js';

/** There is no analysis to correct yet (maps to 404). */
export class JobAnalysisNotFoundError extends Error {
  constructor(readonly jobPostingId: string) {
    super('The job posting has not been analyzed yet.');
    this.name = 'JobAnalysisNotFoundError';
  }
}

/** An analysis is pending or running: it would overwrite the corrections (maps to 409). */
export class AnalysisInProgressError extends Error {
  constructor(readonly jobPostingId: string) {
    super('The job posting is being analyzed; try again when it finishes.');
    this.name = 'AnalysisInProgressError';
  }
}

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

  /**
   * The user's corrections (RF-JD-03). They go through the same normalization as the AI's answer;
   * requirements keep their id when they had one, and tools are matched again since labels may change.
   */
  async update(jobPostingId: string, changes: UpdateJobAnalysisRequest): Promise<JobAnalysis> {
    await this.postings.get(jobPostingId);
    const current = await this.analyses.find(jobPostingId);
    if (!current) throw new JobAnalysisNotFoundError(jobPostingId);
    const job = this.queue.current(jobPostingId);
    if (job && (job.status === 'PENDING' || job.status === 'RUNNING')) {
      throw new AnalysisInProgressError(jobPostingId);
    }

    // Ids the client made up are not trusted: only the current requirements' ids are kept.
    const known = new Set(current.requirements.map((requirement) => requirement.id));
    const analysis = normalizeAnalysis({
      ...changes,
      language: current.language,
      requirements: changes.requirements.map((requirement) => ({
        ...requirement,
        id: requirement.id && known.has(requirement.id) ? requirement.id : undefined,
      })),
    });

    const result: JobAnalysis = {
      ...current,
      ...analysis,
      requirements: await this.matchTools(analysis.requirements),
      editedAt: new Date().toISOString(),
    };
    this.analyses.save(result);
    return result;
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
    const requirements = await this.matchTools(analysis.requirements);

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
      editedAt: null,
    };
    // The posting may have been deleted while the AI answered: its rows cascade, and saving fails.
    await this.postings.get(jobPostingId);
    this.analyses.save(result);
    return result;
  }

  /** Matches `TOOL` requirements to the catalog; requirements without an id get a new one. */
  private async matchTools(
    requirements: (RawRequirement & { id?: string })[],
  ): Promise<JobRequirement[]> {
    const matched: JobRequirement[] = [];
    for (const { id, label, kind, importance } of requirements) {
      const tool = kind === 'TOOL' ? await this.tools.match(label) : null;
      matched.push({ id: id ?? randomUUID(), label, kind, importance, tool });
    }
    return matched;
  }
}
