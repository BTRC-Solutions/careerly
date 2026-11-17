import type { JobAnalysis, RequirementImportance } from '@careerly/contracts';

/*
 * Scoring of the job description analysis against a hand-written expectation (roadmap 4.7, evals). Pure: the
 * eval script (`npm run evals:jd`) runs the real analysis and scores it here.
 */

/** One expected requirement: its wording, or several accepted wordings (e.g. `["Postgres", "PostgreSQL"]`). */
export type ExpectedRequirement = string | string[];

export interface JdEvalExpectation {
  required: ExpectedRequirement[];
  niceToHave: ExpectedRequirement[];
  /** Fine to extract but not expected (e.g. a soft skill the posting barely mentions): no penalty. */
  acceptable?: ExpectedRequirement[];
  /** Only the facts listed are checked. */
  facts?: Partial<
    Pick<
      JobAnalysis,
      'language' | 'roleCategory' | 'seniority' | 'workMode' | 'country' | 'yearsOfExperience'
    >
  >;
}

export interface RequirementMatch {
  expected: string;
  extracted: string;
  expectedImportance: RequirementImportance;
  extractedImportance: RequirementImportance;
}

export interface JdEvalScore {
  /** Expected requirements that were extracted. */
  matched: RequirementMatch[];
  /** Expected requirements that were not extracted. */
  missed: { expected: string; importance: RequirementImportance }[];
  /** Extracted requirements that were neither expected nor acceptable. */
  unexpected: string[];
  /** Extracted requirements that were acceptable (they count as correct for precision). */
  accepted: string[];
  facts: { field: string; expected: unknown; actual: unknown; ok: boolean }[];
}

export interface JdEvalTotals {
  cases: number;
  /** Correct extracted / extracted. */
  precision: number;
  /** Matched expected / expected. */
  recall: number;
  /** Matched requirements with the right importance / matched. */
  importance: number;
  /** Facts right / facts checked. */
  facts: number;
}

/**
 * Pairs each expected requirement with at most one extracted requirement (in the expectation's order) and
 * checks the facts. A wording matches when, ignoring case, accents, punctuation and simple suffixes, it equals
 * the extracted label or its catalog tool, or all of its words are in the label (`"REST APIs"` matches
 * `"Designing REST APIs"`).
 */
export function scoreAnalysis(analysis: JobAnalysis, expectation: JdEvalExpectation): JdEvalScore {
  const remaining = [...analysis.requirements];
  const take = (wordings: string[]) => {
    const index = remaining.findIndex((requirement) =>
      wordings.some(
        (wording) =>
          matches(wording, requirement.label) ||
          (requirement.tool !== null && matches(wording, requirement.tool.name)),
      ),
    );
    return index === -1 ? null : remaining.splice(index, 1)[0]!;
  };

  const matched: RequirementMatch[] = [];
  const missed: JdEvalScore['missed'] = [];
  const expected = [
    ...expectation.required.map((wording) => ({ wording, importance: 'REQUIRED' as const })),
    ...expectation.niceToHave.map((wording) => ({ wording, importance: 'NICE_TO_HAVE' as const })),
  ];
  for (const { wording, importance } of expected) {
    const wordings = alternatives(wording);
    const found = take(wordings);
    if (found) {
      matched.push({
        expected: wordings[0]!,
        extracted: found.label,
        expectedImportance: importance,
        extractedImportance: found.importance,
      });
    } else {
      missed.push({ expected: wordings[0]!, importance });
    }
  }

  const accepted: string[] = [];
  for (const wording of expectation.acceptable ?? []) {
    let found = take(alternatives(wording));
    while (found) {
      accepted.push(found.label);
      found = take(alternatives(wording));
    }
  }

  const facts = Object.entries(expectation.facts ?? {}).map(([field, value]) => {
    const actual = analysis[field as keyof NonNullable<JdEvalExpectation['facts']>];
    return { field, expected: value, actual, ok: actual === value };
  });

  return {
    matched,
    missed,
    unexpected: remaining.map((requirement) => requirement.label),
    accepted,
    facts,
  };
}

/** Micro-averaged totals over all cases (a ratio with nothing to count is 1). */
export function totalScore(scores: JdEvalScore[]): JdEvalTotals {
  const sum = (count: (score: JdEvalScore) => number) =>
    scores.reduce((total, score) => total + count(score), 0);
  const ratio = (part: number, whole: number) => (whole === 0 ? 1 : part / whole);

  const matched = sum((s) => s.matched.length);
  const correct = matched + sum((s) => s.accepted.length);
  return {
    cases: scores.length,
    precision: ratio(correct, correct + sum((s) => s.unexpected.length)),
    recall: ratio(matched, matched + sum((s) => s.missed.length)),
    importance: ratio(
      sum((s) => s.matched.filter((m) => m.expectedImportance === m.extractedImportance).length),
      matched,
    ),
    facts: ratio(
      sum((s) => s.facts.filter((fact) => fact.ok).length),
      sum((s) => s.facts.length),
    ),
  };
}

function alternatives(wording: ExpectedRequirement): string[] {
  return Array.isArray(wording) ? wording : [wording];
}

function matches(wording: string, label: string): boolean {
  const want = words(wording);
  const have = words(label);
  if (want.length === 0) return false;
  if (want.join(' ') === have.join(' ')) return true;
  return want.every((word) => have.includes(word));
}

/** Lowercase words without accents, punctuation or a plural or "-ing" ending ("APIs" → "api"). */
function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}+#]+/u)
    .filter(Boolean)
    .map(stem);
}

function stem(word: string): string {
  if (word.length <= 3) return word;
  for (const suffix of ['ing', 's']) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}
