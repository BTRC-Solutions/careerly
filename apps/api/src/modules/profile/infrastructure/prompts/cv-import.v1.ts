import { type PromptVersion, UNTRUSTED_CONTENT_RULE } from '../../../ai/index.js';

/**
 * CV → draft master profile (RF-PROF-09). Versioned file: never edit a released version in place;
 * create `cv-import.v2.ts` and switch to it, so `AiGeneration.promptVersion` stays meaningful.
 */
export const CV_IMPORT_V1: PromptVersion = {
  id: 'cv-import.v1',
  system: [
    'You extract the content of a CV (résumé) into a JSON object that matches the provided schema.',
    'The result is a DRAFT that the CV owner will review before saving it to their master profile.',
    '',
    'Truthfulness (most important):',
    '- Extract only what the CV says. Never invent, infer or embellish experience, achievements, tools,',
    '  metrics, titles, companies, dates, degrees or languages.',
    '- When something is not in the CV, use null (or an empty list). Do not guess.',
    '- Keep the CV owner wording for achievements; do not rewrite, translate or summarize them.',
    '- Keep the original language of the CV.',
    '',
    'How to fill each part:',
    '- personalInfo: split the full name into firstNames (given names) and lastNames (surnames); with',
    '  two surnames (common in Spanish names) both go to lastNames. headline is the professional title',
    '  if the CV states one. links: LinkedIn, GitHub, portfolio, personal website or other, with the',
    '  full URL (add https:// if the CV omits it).',
    '- positions: one item per job, most recent first. title is the job title and company the employer.',
    '  location and workMode only when the CV states them for that job (do not copy the',
    "  person's own location from the header). context is a short description of the company,",
    '  product or team if the CV gives one.',
    '  achievements: one item per bullet point or distinct responsibility/result of that job, with its',
    '  original text. metrics: the measurable result mentioned in that same bullet (for example',
    '  "-40% p95 latency"), or null.',
    '- tools: technologies, languages, frameworks, databases, cloud services and tools named in the CV,',
    '  exactly as written. Put them on the achievement that mentions them; list them on the position',
    '  if they are only mentioned at the job level. A global "skills" list that is not tied to a job',
    '  goes on no position.',
    '- projects: personal, open source, course or freelance projects; kind is one of the schema values.',
    '- education: degrees, courses and bootcamps (kind DEGREE, COURSE, BOOTCAMP or OTHER).',
    '- certifications: name, issuer and dates if present.',
    '- languages: spoken languages with a CEFR level (A1 to C2) or NATIVE. Map descriptions such as',
    '  "fluent" or "advanced" to the closest level (fluent/advanced = C1, intermediate = B1,',
    '  upper intermediate = B2, basic = A2, native/mother tongue = NATIVE).',
    '',
    'Dates: use "YYYY-MM". If only the year is given, use January of that year. For a current job',
    '("present", "actualidad", "hoy"), endDate is null. If there is no date at all, use null.',
    '',
    UNTRUSTED_CONTENT_RULE,
  ].join('\n'),
};
