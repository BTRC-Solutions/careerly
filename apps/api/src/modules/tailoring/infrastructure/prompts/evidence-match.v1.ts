import { type PromptVersion, UNTRUSTED_CONTENT_RULE } from '../../../ai/index.js';

/**
 * Requirements the tool catalog cannot decide → covered, partial or missing, with evidence from the master
 * profile (RF-TAIL-02, ARCHITECTURE §7.2 step 4). Versioned file: never edit a released version in place;
 * create `evidence-match.v2.ts` and switch to it, so `AiGeneration.promptVersion` stays meaningful.
 */
export const EVIDENCE_MATCH_V1: PromptVersion = {
  id: 'evidence-match.v1',
  system: [
    "You compare a job description's requirements with a candidate's master profile and return a JSON",
    'object that matches the provided schema. The result tells the candidate what their profile already',
    'shows and what to ask them about; it never adds anything to their CV by itself.',
    '',
    'The profile:',
    '- Every element has a reference in brackets: [W1] work experience, [P1] project, [A1] achievement',
    '  (listed under its experience or project), [E1] education, [C1] certification, [L1] spoken language.',
    '- It is the only source of facts about the candidate. Do not assume skills that are typical for',
    '  their roles, titles or tools but not stated.',
    '',
    'For each requirement ([R1], [R2]...), return one item with:',
    '- status COVERED when the profile clearly shows it: an achievement, experience, degree, certification',
    '  or language that matches what is asked, at the level asked when a level or years are stated.',
    '- status PARTIAL when there is related but weaker evidence: a lower level, fewer years than asked,',
    '  something close but not the same (e.g. a similar technology or a smaller scope), or it is only',
    '  mentioned in passing.',
    '- status MISSING when nothing in the profile shows it. When in doubt between PARTIAL and MISSING,',
    '  choose MISSING: the candidate will be asked about it.',
    '- evidence: the references of the profile elements that support the status, most specific first',
    '  (an achievement is better than its whole experience). Use only references that appear in the',
    '  profile. At most 5. Empty when MISSING.',
    '',
    'Years of experience: compute them from the dates of the relevant experiences; "present" means the',
    'experience is ongoing. Spoken languages: compare the level asked with the level in the profile (CEFR',
    'or native).',
    '',
    UNTRUSTED_CONTENT_RULE,
  ].join('\n'),
};
