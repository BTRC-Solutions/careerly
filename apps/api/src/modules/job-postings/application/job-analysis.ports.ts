import type { JobAnalysis, JobPosting, JobView } from '@careerly/contracts';
import type { RawJobAnalysis } from '../domain/job-analysis.js';

/** Port: the AI side of the analysis (RF-JD-02). The posting text is untrusted data. */
export abstract class JdAnalyzer {
  abstract analyze(
    posting: Pick<JobPosting, 'text' | 'title' | 'company' | 'location'>,
  ): Promise<{ analysis: RawJobAnalysis; promptVersion: string; model: string }>;
}

/** Port: matches a tool name to the profile module's catalog (aliases included). */
export abstract class ToolMatcher {
  abstract match(name: string): Promise<{ id: string; name: string } | null>;
}

/** Port: the background job that runs an analysis (one per posting; asking again restarts it). */
export abstract class AnalysisQueue {
  abstract request(jobPostingId: string): JobView;
  abstract current(jobPostingId: string): JobView | null;
}

/** Port: stored analyses and their normalized requirements (ADR-09). */
export abstract class JobAnalysisRepository {
  /** Replaces the posting's previous analysis and requirements, in one transaction. */
  abstract save(analysis: JobAnalysis): void;
  abstract find(jobPostingId: string): Promise<JobAnalysis | null>;
}
