import type { GapQuestion, MatchResult } from '@careerly/contracts';

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
          },
        ],
  );
  const rank = (question: GapQuestion) => (question.importance === 'REQUIRED' ? 0 : 1);
  return questions.sort((a, b) => rank(a) - rank(b));
}
