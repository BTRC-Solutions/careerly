import type { MatchResult, Profile } from '@careerly/contracts';

/*
 * Relevance of the profile's achievements and projects for a job description (ARCHITECTURE §7.2, step 7): the
 * page fitter keeps the best-scored bullets (§8). The AI scores them; this module checks its answer against the
 * profile and adds what the match already knows. Pure.
 */

export type RelevanceCandidateKind = 'ACHIEVEMENT' | 'PROJECT';

export interface RelevanceCandidate {
  kind: RelevanceCandidateKind;
  id: string;
}

export interface RelevanceScore extends RelevanceCandidate {
  /** 0–1. */
  score: number;
}

/** What a scorer answered: a score per candidate, possibly with unknown ids or out-of-range values. */
export interface ScoredAnswer extends RelevanceCandidate {
  score: number;
}

/** An achievement or project that is evidence of a covered or partial requirement scores at least this. */
export const EVIDENCE_FLOOR = 0.5;

/** Every achievement (of positions and projects) and every project of the profile, in profile order. */
export function relevanceCandidates(profile: Profile): RelevanceCandidate[] {
  return [
    ...profile.positions.flatMap((position) =>
      position.achievements.map((a) => ({ kind: 'ACHIEVEMENT' as const, id: a.id })),
    ),
    ...profile.projects.flatMap((project) => [
      { kind: 'PROJECT' as const, id: project.id },
      ...project.achievements.map((a) => ({ kind: 'ACHIEVEMENT' as const, id: a.id })),
    ]),
  ];
}

const key = ({ kind, id }: RelevanceCandidate) => `${kind}:${id}`;

/**
 * One score per candidate, in candidate order:
 * - the scorer's answer, clamped to 0–1 and rounded to two decimals; answers for ids that are not candidates
 *   are dropped, and a candidate without an answer scores 0;
 * - at least `EVIDENCE_FLOOR` when the match cites it as evidence of a requirement it covers or partly covers.
 */
export function relevanceScores(
  candidates: readonly RelevanceCandidate[],
  answers: readonly ScoredAnswer[],
  match: MatchResult | null,
): RelevanceScore[] {
  const answered = new Map<string, number>();
  for (const answer of answers) {
    if (Number.isFinite(answer.score)) answered.set(key(answer), answer.score);
  }
  const evidence = new Set(
    (match?.requirements ?? [])
      .filter((requirement) => requirement.status !== 'MISSING')
      .flatMap((requirement) => requirement.evidence)
      .filter((item) => item.kind === 'ACHIEVEMENT' || item.kind === 'PROJECT')
      .map((item) => key({ kind: item.kind as RelevanceCandidateKind, id: item.id })),
  );

  return candidates.map((candidate) => {
    const raw = Math.min(1, Math.max(0, answered.get(key(candidate)) ?? 0));
    const score = evidence.has(key(candidate)) ? Math.max(raw, EVIDENCE_FLOOR) : raw;
    return { ...candidate, score: Math.round(score * 100) / 100 };
  });
}
