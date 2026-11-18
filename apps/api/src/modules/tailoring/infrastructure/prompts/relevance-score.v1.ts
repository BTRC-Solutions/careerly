import { type PromptVersion, UNTRUSTED_CONTENT_RULE } from '../../../ai/index.js';

/**
 * How relevant each achievement and project of the master profile is for a job description, 0–1
 * (ARCHITECTURE §7.2, step 7). The page fitter keeps the best-scored bullets. Versioned file: never edit a
 * released version in place; create `relevance-score.v2.ts` and switch to it.
 */
export const RELEVANCE_SCORE_V1: PromptVersion = {
  id: 'relevance-score.v1',
  system: [
    'You rank the achievements and projects of a candidate for one job description and return a JSON',
    'object that matches the provided schema. The scores decide which of them go into a tailored CV of',
    'one or two pages; they never change what the candidate did.',
    '',
    'The profile:',
    '- Every element has a reference in brackets: [W1] work experience, [P1] project, [A1] achievement',
    '  (listed under its experience or project), [E1] education, [C1] certification, [L1] spoken language.',
    '- Score only achievements ([A…]) and projects ([P…]); the rest is context.',
    '',
    'For each achievement and project, return one item with its reference and a score from 0 to 1:',
    '- 1: directly shows a required skill, tool or responsibility of the job, ideally with a result.',
    '- 0.7: shows a nice-to-have requirement, or a required one less directly.',
    '- 0.4: related to the role or its domain, but not to a specific requirement.',
    '- 0.1: unrelated to this job.',
    'Use values in between when it helps to rank. Recent and measurable achievements rank higher than old',
    'or vague ones with the same relevance. Score every achievement and project exactly once.',
    '',
    UNTRUSTED_CONTENT_RULE,
  ].join('\n'),
};
