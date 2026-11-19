import type { GapQuestion } from '@careerly/contracts';
import type { TFunction } from 'i18next';

/*
 * The wording of a gap question (RF-TAIL-04): a template per kind of requirement and kind of gap, in the
 * interface's language. No AI: the same requirement is always asked the same way.
 */

export interface GapQuestionText {
  question: string;
  /** Partial gaps: introduces the related evidence the profile already has (RF-GAP-03). */
  hint: string | null;
}

/** What the question names: the catalog tool when the requirement resolved to one, else its label. */
export const gapSubject = (question: GapQuestion) => question.tool?.name ?? question.label;

export function gapQuestionText(question: GapQuestion, t: TFunction): GapQuestionText {
  const name = gapSubject(question);
  return {
    question: t(`tailoring.gaps.templates.${question.kind}.${question.gap}`, { name }),
    hint:
      question.gap === 'PARTIAL'
        ? t(`tailoring.gaps.partialHint.${question.kind}`, { name })
        : null,
  };
}
