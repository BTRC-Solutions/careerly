import type { GapAnswer, GapQuestion, MatchResult, Profile } from '@careerly/contracts';

/*
 * Gap questions (RF-TAIL-04, ARCHITECTURE §7.2 step 5): one per partial or missing requirement of the match,
 * tools and everything else alike (RF-GAP-04). Built from the match alone, without AI; the interface words each
 * question from templates in its language. Pure.
 */

/** Required requirements first; otherwise the job description's order. */
export function gapQuestions(match: MatchResult): GapQuestion[] {
  const questions = match.requirements.flatMap((requirement): GapQuestion[] =>
    requirement.status === 'COVERED'
      ? []
      : [
          {
            requirementId: requirement.requirementId,
            label: requirement.label,
            kind: requirement.kind,
            importance: requirement.importance,
            tool: requirement.tool,
            gap: requirement.status,
            // Partial ones show what is related (RF-GAP-03); missing ones have nothing to show.
            relatedEvidence: requirement.status === 'PARTIAL' ? requirement.evidence : [],
            answer: null,
            answeredAt: null,
            created: [],
          },
        ],
  );
  const rank = (question: GapQuestion) => (question.importance === 'REQUIRED' ? 0 : 1);
  return questions.sort((a, b) => rank(a) - rank(b));
}

/**
 * The questions to ask again (e.g. back from the review): the current gaps, keeping the answers already given
 * to the same requirements.
 */
export function keepAnswers(
  questions: readonly GapQuestion[],
  previous: readonly GapQuestion[],
): GapQuestion[] {
  const answered = new Map(previous.map((question) => [question.requirementId, question]));
  return questions.map((question) => {
    const before = answered.get(question.requirementId);
    return before
      ? {
          ...question,
          answer: before.answer,
          answeredAt: before.answeredAt,
          created: before.created,
        }
      : question;
  });
}

/**
 * Why an answer cannot be saved against the profile as it is: positions or a project that do not exist.
 * `null` when it can.
 */
export function invalidAnswerReason(
  answer: GapAnswer,
  profile: Pick<Profile, 'positions' | 'projects'>,
): string | null {
  if (answer.answer === 'USED_AT_WORK') {
    const known = new Set(profile.positions.map((position) => position.id));
    if (answer.positionIds.some((id) => !known.has(id))) return 'Unknown position.';
    if (new Set(answer.positionIds).size !== answer.positionIds.length) {
      return 'Positions must not repeat.';
    }
  }
  if (answer.answer === 'USED_ELSEWHERE' && 'id' in answer.project) {
    const id = answer.project.id;
    if (!profile.projects.some((project) => project.id === id)) return 'Unknown project.';
  }
  return null;
}

/** Answers that add something to the master profile (RF-TAIL-05); "no" and skipped never do (RN-11). */
export const isAffirmative = (answer: GapAnswer | null) =>
  answer?.answer === 'USED_AT_WORK' || answer?.answer === 'USED_ELSEWHERE';

/**
 * The match after the answers (RF-GAP-05), without AI: a requirement whose answer added achievements to the
 * profile is covered by them; one whose answer added nothing is back to how the match left it. Requirements
 * without a question are not touched.
 */
export function matchWithAnswers(
  match: MatchResult,
  questions: readonly GapQuestion[],
): MatchResult {
  const byRequirement = new Map(questions.map((question) => [question.requirementId, question]));
  return {
    ...match,
    requirements: match.requirements.map((requirement) => {
      const question = byRequirement.get(requirement.requirementId);
      if (!question) return requirement;
      const achievements = question.created.filter((item) => item.kind === 'ACHIEVEMENT');
      return achievements.length > 0
        ? { ...requirement, status: 'COVERED', evidence: achievements }
        : { ...requirement, status: question.gap, evidence: question.relatedEvidence };
    }),
  };
}
