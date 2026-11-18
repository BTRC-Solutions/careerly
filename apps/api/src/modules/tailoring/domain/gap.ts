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
      ? { ...question, answer: before.answer, answeredAt: before.answeredAt }
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
