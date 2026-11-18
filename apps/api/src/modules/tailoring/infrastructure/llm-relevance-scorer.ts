import type { JobAnalysis, Profile } from '@careerly/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { LlmClient, untrustedText } from '../../ai/index.js';
import { RelevanceScorer } from '../application/tailoring.ports.js';
import type { RelevanceCandidate, ScoredAnswer } from '../domain/relevance.js';
import { describeProfile, parseRef } from './llm-requirement-matcher.js';
import { RELEVANCE_SCORE_V1 } from './prompts/relevance-score.v1.js';

/** The answer the model must produce (plain schema: it is also sent as JSON Schema). */
const RelevanceAnswerSchema = z.object({
  scores: z.array(z.object({ ref: z.string(), score: z.number() })),
});

/** Scoring is an extraction-like task: the small tier (ARCHITECTURE §7.3). */
const TIMEOUT_MS = 120_000;

/**
 * Scores the candidates with the active AI provider. The profile goes with the same short references as in the
 * match (`[A3]`, `[P1]`), mapped back to ids here; `relevanceScores` checks them again. The job description's
 * requirements and keywords go in an untrusted block. Neither the prompt nor the answer is logged.
 */
@Injectable()
export class LlmRelevanceScorer extends RelevanceScorer {
  private readonly logger = new Logger(LlmRelevanceScorer.name);

  constructor(private readonly llm: LlmClient) {
    super();
  }

  async score(candidates: RelevanceCandidate[], profile: Profile, analysis: JobAnalysis) {
    const { text: profileText, refs } = describeProfile(profile);
    const jobText = [
      `Role: ${analysis.roleCategory}, ${analysis.seniority}.`,
      analysis.yearsOfExperience !== null && `Years of experience: ${analysis.yearsOfExperience}.`,
      'Requirements:',
      ...analysis.requirements.map((r) => `- (${r.kind}, ${r.importance}) ${r.label}`),
      analysis.keywords.length > 0 && `Keywords: ${analysis.keywords.join(', ')}.`,
    ]
      .filter(Boolean)
      .join('\n');

    const { data, usage } = await this.llm.generateStructured({
      task: 'relevance-score',
      prompt: RELEVANCE_SCORE_V1,
      tier: 'small',
      input: [
        // The profile goes first: it is the large, stable part of the session's prompts (caching).
        { type: 'text', text: `Master profile of the candidate:\n\n${profileText}` },
        { type: 'text', text: 'Score its achievements and projects for this job:' },
        untrustedText('job-description', jobText),
      ],
      schema: RelevanceAnswerSchema,
      timeoutMs: TIMEOUT_MS,
    });

    const wanted = new Set(candidates.map((c) => `${c.kind}:${c.id}`));
    const answers: ScoredAnswer[] = data.scores.flatMap(({ ref, score }) => {
      const evidence = refs.get(parseRef(ref) ?? '');
      if (!evidence || (evidence.kind !== 'ACHIEVEMENT' && evidence.kind !== 'PROJECT')) return [];
      if (!wanted.has(`${evidence.kind}:${evidence.id}`)) return [];
      return [{ kind: evidence.kind, id: evidence.id, score }];
    });
    this.logger.log(
      `Scored ${candidates.length} candidate(s) with ${usage.model} (${usage.attempts} attempt(s)).`,
    );
    return { answers, promptVersion: RELEVANCE_SCORE_V1.id, model: usage.model };
  }
}
