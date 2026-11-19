/*
 * Truthfulness guard (ARCHITECTURE.md §7.2 step 9; RN-01, RN-02, RN-03). Deterministic and pure: it checks what
 * the AI wrote against the master profile, never against the job description.
 *
 * - RN-01 (every bullet cites an achievement of its own experience) is enforced when the answer becomes CV data
 *   (`tailoredResumeData`): a bullet without sources is dropped, not rewritten.
 * - RN-02, tools: every catalog tool a text mentions must be shown by its sources: tagged on the experience or on
 *   a cited achievement, or named in the text of the sources. For the summary, anywhere in the profile.
 * - Numbers (metrics, amounts, team sizes): every number must appear in the sources (as digits, with `k`/`M`
 *   and thousands separators normalized, or as a word up to ten), or be a number of years the dates allow.
 * - RN-03 needs no check here: companies, titles and dates are copied from the profile when the CV is built.
 *
 * A text that fails goes back to the AI once, with its problems (`findTruthIssues`); what still fails after that
 * is dropped and logged (`applyRewrites`). Bullets edited by the user are not checked (RN-05).
 */

import type {
  GuardDrop,
  Position,
  Profile,
  Project,
  TailoredResumeData,
  TruthIssueReason,
} from '@careerly/contracts';
import { bulletSourceIds, findExperience, summarySourceIds } from './resume-writing.js';

/** A name or alias of a catalog tool. */
export interface ToolTerm {
  toolId: string;
  term: string;
}

/** "2026-11". */
type YearMonth = string;

export type TruthTarget =
  { kind: 'BULLET'; experienceId: string; bulletId: string } | { kind: 'SUMMARY' };

export interface TruthIssue {
  target: TruthTarget;
  /** The text as written. */
  text: string;
  reasons: TruthIssueReason[];
  /** What broke the rules, to tell the AI when it rewrites the text. */
  tools: string[];
  numbers: string[];
}

/** The AI's rewrite of a text with issues; an empty text means it could not be fixed. */
export interface TruthRewrite {
  target: TruthTarget;
  text: string;
  sourceIds: string[];
}

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

/** Every text of the CV that breaks RN-02 or has numbers its sources do not have. */
export function findTruthIssues(
  data: TailoredResumeData,
  profile: Profile,
  vocabulary: ToolTerm[],
  today: YearMonth,
): TruthIssue[] {
  const finder = toolFinder(vocabulary);
  const issues: TruthIssue[] = [];
  for (const experience of data.experiences) {
    for (const bullet of experience.bullets) {
      if (bullet.editedByUser) continue;
      const target: TruthTarget = {
        kind: 'BULLET',
        experienceId: experience.sourceId,
        bulletId: bullet.id,
      };
      const issue = checkBullet(target, bullet.text, bullet.sourceIds, profile, finder, today);
      if (issue) issues.push(issue);
    }
  }
  if (data.summary) {
    const issue = checkSummary(data.summary.text, profile, finder, today);
    if (issue) issues.push(issue);
  }
  return issues;
}

function checkBullet(
  target: Extract<TruthTarget, { kind: 'BULLET' }>,
  text: string,
  sourceIds: string[],
  profile: Profile,
  finder: ToolFinder,
  today: YearMonth,
): TruthIssue | null {
  const owner = experienceOf(profile, target.experienceId);
  if (!owner) return issue(target, text, ['UNKNOWN_EXPERIENCE'], [], []);
  const cited = new Set(sourceIds);
  const achievements = owner.achievements.filter((a) => cited.has(a.id));
  const sourceTexts = [
    ...achievements.flatMap((a) => [a.text, a.metrics]),
    'context' in owner ? owner.context : owner.description,
  ];
  const tagged = [...owner.tools, ...achievements.flatMap((a) => a.tools)].map((t) => t.id);
  return judge(target, text, {
    finder,
    tools: new Set([...tagged, ...sourceTexts.flatMap((t) => [...finder.find(t ?? '')])]),
    numbers: numbersIn(sourceTexts),
    maxYears: yearsBetween(owner.startDate, owner.endDate ?? today),
    years: datesOf([owner]),
  });
}

function checkSummary(
  text: string,
  profile: Profile,
  finder: ToolFinder,
  today: YearMonth,
): TruthIssue | null {
  const experiences = [...profile.positions, ...profile.projects];
  const texts = profileTexts(profile);
  const starts = profile.positions.map((p) => p.startDate).sort();
  return judge({ kind: 'SUMMARY' }, text, {
    finder,
    tools: new Set([
      ...experiences.flatMap((e) => [
        ...e.tools.map((t) => t.id),
        ...e.achievements.flatMap((a) => a.tools.map((t) => t.id)),
      ]),
      ...texts.flatMap((t) => [...finder.find(t)]),
    ]),
    numbers: numbersIn(texts),
    maxYears: starts.length > 0 ? yearsBetween(starts[0]!, today) : 0,
    years: datesOf([...experiences, ...profile.education, ...profile.certifications]),
  });
}

interface Allowed {
  finder: ToolFinder;
  tools: Set<string>;
  numbers: Set<number>;
  /** Whole years the dates span: "5 years of experience" is computed, not stated. */
  maxYears: number;
  /** Calendar years of the dates, e.g. 2021. */
  years: Set<number>;
}

function judge(target: TruthTarget, text: string, allowed: Allowed): TruthIssue | null {
  const tools = [...allowed.finder.find(text)].filter((id) => !allowed.tools.has(id));
  const numbers = numberMentions(text).filter(
    ({ value, years }) =>
      !allowed.numbers.has(value) &&
      !(years && Number.isInteger(value) && value >= 1 && value <= allowed.maxYears) &&
      !allowed.years.has(value),
  );
  if (tools.length === 0 && numbers.length === 0) return null;
  const reasons: TruthIssueReason[] = [];
  if (tools.length > 0) reasons.push('TOOL_NOT_IN_SOURCES');
  if (numbers.length > 0) reasons.push('NUMBER_NOT_IN_SOURCES');
  return issue(
    target,
    text,
    reasons,
    tools.map((id) => allowed.finder.name(id)),
    numbers.map((n) => n.raw),
  );
}

function issue(
  target: TruthTarget,
  text: string,
  reasons: TruthIssueReason[],
  tools: string[],
  numbers: string[],
): TruthIssue {
  return { target, text, reasons, tools, numbers };
}

// ---------------------------------------------------------------------------
// Rewrites
// ---------------------------------------------------------------------------

/**
 * Applies the AI's rewrites of the texts with issues. A rewrite that is missing, empty, cites nothing of its
 * own experience or still breaks a rule is not used: the text is dropped and logged with its reasons.
 */
export function applyRewrites(
  data: TailoredResumeData,
  issues: TruthIssue[],
  rewrites: TruthRewrite[],
  profile: Profile,
  vocabulary: ToolTerm[],
  today: YearMonth,
): TailoredResumeData {
  const finder = toolFinder(vocabulary);
  const key = (target: TruthTarget) =>
    target.kind === 'SUMMARY' ? 'SUMMARY' : `${target.experienceId}:${target.bulletId}`;
  const byTarget = new Map(rewrites.map((r) => [key(r.target), r]));

  let summary = data.summary;
  const experiences = data.experiences.map((e) => ({ ...e, bullets: [...e.bullets] }));
  const dropped: GuardDrop[] = [...data.guard.dropped];
  let rewritten = data.guard.rewritten;

  for (const original of issues) {
    const rewrite = byTarget.get(key(original.target));
    const text = rewrite?.text.trim() ?? '';
    const { target } = original;

    if (target.kind === 'SUMMARY') {
      const fixed = text === '' ? original : (checkSummary(text, profile, finder, today) ?? null);
      if (fixed === null) {
        summary = { text, sourceIds: summarySourceIds(profile, rewrite!.sourceIds) };
        rewritten += 1;
      } else {
        summary = null;
        dropped.push({
          kind: 'SUMMARY',
          experienceId: null,
          text: fixed.text,
          reasons: fixed.reasons,
        });
      }
      continue;
    }

    const experience = experiences.find((e) => e.sourceId === target.experienceId);
    const index = experience?.bullets.findIndex((b) => b.id === target.bulletId) ?? -1;
    if (!experience || index < 0) continue;
    const sourceIds =
      text === ''
        ? []
        : bulletSourceIds(profile, experience.kind, experience.sourceId, rewrite!.sourceIds);
    const remaining: TruthIssue | null =
      text === ''
        ? original
        : sourceIds.length === 0
          ? issue(target, text, ['NO_SOURCE'], [], [])
          : checkBullet(target, text, sourceIds, profile, finder, today);
    if (remaining === null) {
      experience.bullets[index] = { ...experience.bullets[index]!, text, sourceIds };
      rewritten += 1;
    } else {
      experience.bullets.splice(index, 1);
      dropped.push({
        kind: 'BULLET',
        experienceId: experience.sourceId,
        text: remaining.text,
        reasons: remaining.reasons,
      });
    }
  }

  return {
    ...data,
    summary,
    experiences: experiences.filter((e) => e.bullets.length > 0),
    guard: { rewritten, dropped },
  };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

/**
 * Terms that are also ordinary words ("Go", "REST", "Spring") or too short to be told apart ("R", "C", "ML"):
 * they count only when written exactly as the term.
 */
const AMBIGUOUS = new Set([
  'go',
  'rest',
  'express',
  'spring',
  'swift',
  'less',
  'solid',
  'agile',
  'chef',
  'puppet',
  'spark',
  'ruby',
  'rust',
  'dart',
  'notion',
  'excel',
  'nest',
  'ember',
  'flask',
  'gin',
  'maven',
  'jest',
  'bun',
  'salt',
  'echo',
  'next',
  'teams',
  'word',
  'office',
  'make',
]);

/** Longest tool name, in words, looked for in a text ("Google Cloud Platform"). */
const MAX_TERM_WORDS = 4;

interface ToolFinder {
  /** Ids of the tools the text mentions. */
  find(text: string): Set<string>;
  name(toolId: string): string;
}

function toolFinder(vocabulary: ToolTerm[]): ToolFinder {
  const index = new Map<string, { toolId: string; term: string; strict: boolean }[]>();
  const names = new Map<string, string>();
  for (const { toolId, term } of vocabulary) {
    const key = normalize(term);
    if (key === '') continue;
    if (!names.has(toolId)) names.set(toolId, term);
    const strict = key.length <= 2 || AMBIGUOUS.has(key);
    index.set(key, [...(index.get(key) ?? []), { toolId, term: term.trim(), strict }]);
  }
  return {
    find(text) {
      const found = new Set<string>();
      const words = tokens(text);
      for (let start = 0; start < words.length; start += 1) {
        for (let size = 1; size <= MAX_TERM_WORDS && start + size <= words.length; size += 1) {
          const written = words.slice(start, start + size).join(' ');
          for (const entry of index.get(normalize(written)) ?? []) {
            if (!entry.strict || written === entry.term) found.add(entry.toolId);
          }
        }
      }
      return found;
    },
    name: (toolId) => names.get(toolId) ?? toolId,
  };
}

/** Words of a text, with surrounding punctuation removed but inner dots kept ("Node.js", ".NET"). */
function tokens(text: string): string[] {
  return text
    .split(/[\s,;:()[\]{}"“”'‘’!?¿¡|/]+/u)
    .map((word) => word.replace(/\.+$/u, '').replace(/^[-–—*•]+/u, ''))
    .filter((word) => word !== '');
}

/** As the catalog compares names: no accents, lower case, only letters, digits, `#` and `+`. */
function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}#+]/gu, '');
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

interface NumberMention {
  raw: string;
  value: number;
  /** "5 years", "5+ años": a number of years, which may be computed from the dates. */
  years: boolean;
}

const MULTIPLIERS: [RegExp, number][] = [
  [/^(k|mil|thousand)$/iu, 1e3],
  [/^(m|mm|mill(o|ó)n(es)?|millions?)$/iu, 1e6],
  [/^(b|bn|billions?)$/iu, 1e9],
];

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
};

/**
 * Numbers written with digits, not part of a name ("S3", "ES6", "k8s"). "50k", "50.000" and "50,000" are 50000;
 * "1,5M" and "1.5M" are 1500000; a percentage is its number.
 */
export function numberMentions(text: string): NumberMention[] {
  const pattern =
    /(?<![\p{L}\p{N}.,])(\d+(?:[.,]\d+)*)(?:\s?(%|k|mil|thousand|m|mm|mill(?:o|ó)n(?:es)?|millions?|b|bn|billions?)(?![\p{L}\p{N}]))?(?![\p{L}\p{N}])/giu;
  const mentions: NumberMention[] = [];
  for (const match of text.matchAll(pattern)) {
    const [raw, digits, unit] = match;
    let value = parseDigits(digits!);
    if (Number.isNaN(value)) continue;
    const multiplier = unit ? MULTIPLIERS.find(([re]) => re.test(unit))?.[1] : undefined;
    if (multiplier) value *= multiplier;
    const after = text.slice(match.index + raw.length);
    const years = !unit && /^\s?\+?\s?(years?|yrs?|años?)(?![\p{L}])/iu.test(after);
    mentions.push({ raw: raw.trim(), value: round(value), years });
  }
  return mentions;
}

/**
 * "50.000" and "1,250,000" are thousands; "1,5" and "2.5" are decimals; with both separators, the last one is
 * the decimal one ("1,234.5", "1.234,5").
 */
function parseDigits(digits: string): number {
  if (/^\d{1,3}([.,]\d{3})+$/.test(digits)) return Number(digits.replace(/[.,]/g, ''));
  const decimal = Math.max(digits.lastIndexOf('.'), digits.lastIndexOf(','));
  if (decimal < 0) return Number(digits);
  return Number(`${digits.slice(0, decimal).replace(/[.,]/g, '')}.${digits.slice(decimal + 1)}`);
}

/** Every number the sources state, in digits or as a word up to ten. */
function numbersIn(texts: (string | null | undefined)[]): Set<number> {
  const numbers = new Set<number>();
  for (const text of texts) {
    if (!text) continue;
    for (const { value } of numberMentions(text)) numbers.add(value);
    for (const word of text.toLowerCase().split(/[^\p{L}]+/u)) {
      const value = NUMBER_WORDS[word];
      if (value !== undefined) numbers.add(value);
    }
  }
  return numbers;
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

// ---------------------------------------------------------------------------
// Dates and profile text
// ---------------------------------------------------------------------------

function experienceOf(profile: Profile, id: string): Position | Project | undefined {
  return findExperience(profile, 'POSITION', id) ?? findExperience(profile, 'PROJECT', id);
}

/** Whole years between two "YYYY-MM" dates, rounded up: 2019-03 → 2023-01 is 4. */
function yearsBetween(start: YearMonth | null, end: YearMonth): number {
  if (!start) return 0;
  const months = (date: YearMonth) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
  return Math.max(0, Math.ceil((months(end) - months(start)) / 12));
}

function datesOf(items: object[]): Set<number> {
  const years = new Set<number>();
  for (const item of items) {
    for (const value of Object.values(item)) {
      if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value))
        years.add(Number(value.slice(0, 4)));
    }
  }
  return years;
}

/** Every free text of the profile a summary may draw on. */
function profileTexts(profile: Profile): string[] {
  const info = profile.personalInfo;
  return [
    info.headline,
    info.summary,
    ...profile.positions.flatMap((p) => [
      p.title,
      p.context,
      ...p.achievements.flatMap((a) => [a.text, a.metrics]),
    ]),
    ...profile.projects.flatMap((p) => [
      p.name,
      p.description,
      ...p.achievements.flatMap((a) => [a.text, a.metrics]),
    ]),
    ...profile.education.flatMap((e) => [e.title, e.field, e.description]),
    ...profile.certifications.map((c) => c.name),
    ...profile.languages.map((l) => l.notes),
  ].filter((text): text is string => typeof text === 'string' && text !== '');
}
