import { type PromptVersion, UNTRUSTED_CONTENT_RULE } from '../../../ai/index.js';

/**
 * Second chance for CV texts the truthfulness guard rejected (RN-01, RN-02, ARCHITECTURE §7.2 step 9): each one
 * comes with what broke the rules, and is rewritten from its sources or given up. Versioned file: never edit a
 * released version in place; create `resume-rewriting.v2.ts` and switch to it.
 */
export const RESUME_REWRITING_V1: PromptVersion = {
  id: 'resume-rewriting.v1',
  system: [
    "Some bullets or the summary of a candidate's CV mention facts that their sources in the master profile",
    'do not support. Rewrite each of them so that every fact comes from its sources, and return a JSON',
    'object that matches the provided schema.',
    '',
    'The profile has a reference in brackets for every element: [W1] work experience, [P1] project,',
    '[A1] achievement (listed under its experience or project), [E1] education, [C1] certification,',
    '[L1] spoken language. It is the only source of facts about the candidate.',
    '',
    'For each item ([B1], [B2]... for bullets, [S1] for the summary):',
    '- Remove or replace what the problems list: a tool its sources do not show, a number its sources do',
    '  not have. Do not move the fact to another wording: if it is not in the sources, it goes.',
    '- A bullet may cite only achievements listed under its own experience or project (for a project, its',
    '  own [P] reference also works). Put them in "sources". The summary may cite anything in the profile.',
    '- Keep the language, the tone and, when possible, the length of the original text.',
    '- If nothing true is left to say, return the item with an empty text: it will be left out of the CV.',
    '',
    'Return one item per item you were given, with its reference in "item".',
    '',
    UNTRUSTED_CONTENT_RULE,
  ].join('\n'),
};
