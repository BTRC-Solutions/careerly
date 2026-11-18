import { Injectable } from '@nestjs/common';
import { relevanceCandidates, relevanceScores } from '../domain/relevance.js';
import {
  JobDescriptionReader,
  ProfileReader,
  RelevanceRepository,
  RelevanceScorer,
  type SessionRelevance,
  TailoringSessionNotFoundError,
  TailoringSessionRepository,
} from './tailoring.ports.js';

/**
 * Scores the relevance of the profile's achievements and projects for a session's job description
 * (ARCHITECTURE §7.2, step 7) and stores one score per candidate. The CV generation runs it first, so the
 * scores follow the profile as it is then (gap answers included).
 */
@Injectable()
export class RelevanceService {
  constructor(
    private readonly sessions: TailoringSessionRepository,
    private readonly jobDescriptions: JobDescriptionReader,
    private readonly profile: ProfileReader,
    private readonly scorer: RelevanceScorer,
    private readonly relevance: RelevanceRepository,
  ) {}

  async score(sessionId: string): Promise<SessionRelevance> {
    const session = await this.sessions.find(sessionId);
    if (!session) throw new TailoringSessionNotFoundError(sessionId);
    const [analysis, profile] = await Promise.all([
      this.jobDescriptions.analysis(session.jobPostingId),
      this.profile.read(),
    ]);

    const candidates = relevanceCandidates(profile);
    // Nothing to score: no need to call the AI.
    const answer =
      candidates.length > 0
        ? await this.scorer.score(candidates, profile, analysis)
        : { answers: [], promptVersion: null, model: null };

    const result: SessionRelevance = {
      sessionId,
      scores: relevanceScores(candidates, answer.answers, session.match),
      promptVersion: answer.promptVersion,
      model: answer.model,
      scoredAt: new Date().toISOString(),
    };
    await this.relevance.save(result);
    return result;
  }

  find(sessionId: string): Promise<SessionRelevance | null> {
    return this.relevance.find(sessionId);
  }
}
