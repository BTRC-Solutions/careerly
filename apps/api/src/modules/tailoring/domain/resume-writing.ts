/*
 * Tailored CV writing (ARCHITECTURE.md §7.2 step 8, RF-TAIL-10, RF-TAIL-11). The AI words the bullets and the
 * summary; everything here is deterministic and pure:
 *
 * - `tailoredResumeData` keeps only what can be traced to the profile (RN-01): an experience that exists, and
 *   bullets whose sources are achievements of that same experience (or the project itself). A bullet left
 *   without sources is dropped (logged in `guard`). Tools and numbers are checked by `truth-guard.ts`.
 * - `selectSkills` picks the profile tools for the skills section, the ones the job description asks for first.
 * - `buildResumeDocument` turns it into the document a template renders. Companies, titles, dates, education,
 *   certifications and languages are copied from the profile, never from the AI (RN-03). Positions go in reverse
 *   chronological order and all of them are kept, with no bullets when none were written (RN-06, RN-07).
 */

import type {
  FitSelection,
  GuardDrop,
  MatchResult,
  Position,
  Profile,
  Project,
  ResumeDocument,
  ResumeLanguage,
  ResumePaper,
  TailoredExperience,
  TailoredResumeData,
  TruthIssueReason,
} from '@careerly/contracts';

/** What the writer answered, with its references already turned into profile ids. */
export interface WrittenResume {
  summary: { text: string; sourceIds: string[] } | null;
  experiences: {
    kind: 'POSITION' | 'PROJECT';
    sourceId: string;
    bullets: { text: string; sourceIds: string[] }[];
  }[];
}

/** Most bullets per experience, so a talkative model does not flood the review (the fitter trims later). */
export const MAX_BULLETS_PER_EXPERIENCE = 6;

/** Most tools in the skills section. */
export const MAX_SKILLS = 20;

/**
 * The AI's answer as tailored CV data, with what cannot be traced already out (RN-01): bullets for an unknown
 * experience or without a source of their own are dropped and logged, not rewritten. The rest of the guard
 * (tools and numbers) runs on the result (`truth-guard.ts`).
 */
export function tailoredResumeData(
  written: WrittenResume,
  profile: Profile,
  match: MatchResult | null,
  newId: () => string,
): TailoredResumeData {
  const dropped: GuardDrop[] = [];
  const experiences = new Map<string, TailoredExperience>();

  for (const item of written.experiences) {
    const owner = findExperience(profile, item.kind, item.sourceId);
    if (!owner) {
      for (const bullet of item.bullets) {
        dropped.push(bulletDrop(item.sourceId, bullet.text, 'UNKNOWN_EXPERIENCE'));
      }
      continue;
    }
    const experience = experiences.get(owner.id) ?? {
      kind: item.kind,
      sourceId: owner.id,
      bullets: [],
    };
    for (const bullet of item.bullets) {
      const text = bullet.text.trim();
      if (text === '' || experience.bullets.length >= MAX_BULLETS_PER_EXPERIENCE) continue;
      const sourceIds = bulletSourceIds(profile, item.kind, owner.id, bullet.sourceIds);
      if (sourceIds.length === 0) {
        dropped.push(bulletDrop(owner.id, text, 'NO_SOURCE'));
        continue;
      }
      experience.bullets.push({ id: newId(), text, sourceIds, score: null, editedByUser: false });
    }
    if (experience.bullets.length > 0) experiences.set(owner.id, experience);
  }

  const summaryText = written.summary?.text.trim() ?? '';
  return {
    summary:
      summaryText === ''
        ? null
        : { text: summaryText, sourceIds: summarySourceIds(profile, written.summary!.sourceIds) },
    experiences: [...experiences.values()],
    toolIds: selectSkills(profile, match),
    guard: { rewritten: 0, dropped },
    fit: null,
  };
}

/** The sources a bullet may cite: achievements of its own experience, or the project itself (RN-01). */
export function bulletSourceIds(
  profile: Profile,
  kind: 'POSITION' | 'PROJECT',
  experienceId: string,
  sourceIds: string[],
): string[] {
  const owner = findExperience(profile, kind, experienceId);
  if (!owner) return [];
  const allowed = new Set(owner.achievements.map((a) => a.id));
  if (kind === 'PROJECT') allowed.add(owner.id);
  return unique(sourceIds).filter((id) => allowed.has(id));
}

/** The sources a summary may cite: anything in the profile. */
export function summarySourceIds(profile: Profile, sourceIds: string[]): string[] {
  const known = profileElementIds(profile);
  return unique(sourceIds).filter((id) => known.has(id));
}

function bulletDrop(experienceId: string, text: string, reason: TruthIssueReason): GuardDrop {
  return { kind: 'BULLET', experienceId, text: text.trim(), reasons: [reason] };
}

/**
 * The profile tools for the skills section: first the ones the match found for a tool requirement, in the job
 * description's order; then the rest, the most used first (achievements count more than a mere listing).
 */
export function selectSkills(profile: Profile, match: MatchResult | null): string[] {
  const weight = new Map<string, number>();
  const add = (id: string, points: number) => weight.set(id, (weight.get(id) ?? 0) + points);
  for (const experience of [...profile.positions, ...profile.projects]) {
    for (const tool of experience.tools) add(tool.id, 1);
    for (const achievement of experience.achievements) {
      for (const tool of achievement.tools) add(tool.id, 2);
    }
  }

  const asked = (match?.requirements ?? [])
    .filter((r) => r.tool !== null && r.status !== 'MISSING' && weight.has(r.tool.id))
    .map((r) => r.tool!.id);
  const rest = [...weight.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([id]) => id)
    .filter((id) => !asked.includes(id));
  return unique([...asked, ...rest]).slice(0, MAX_SKILLS);
}

/** The profile had no name to put on the CV. */
export class ResumeWithoutNameError extends Error {
  constructor() {
    super('Add your name to the profile before building a CV.');
    this.name = 'ResumeWithoutNameError';
  }
}

export interface BuildResumeInput {
  data: TailoredResumeData;
  profile: Profile;
  language: ResumeLanguage;
  paper: ResumePaper;
  /**
   * The bullets to show, in order (the page fit). Defaults to the CV's own fit; without one, every bullet in
   * the order written and every project with bullets.
   */
  selection?: FitSelection | null;
}

/** The document a template renders. Throws `ResumeWithoutNameError` when the profile has no name. */
export function buildResumeDocument({
  data,
  profile,
  language,
  paper,
  selection = data.fit?.selection ?? null,
}: BuildResumeInput): ResumeDocument {
  const info = profile.personalInfo;
  const name = [info.firstNames, info.lastNames].map(orNull).filter(Boolean).join(' ');
  if (name === '') throw new ResumeWithoutNameError();

  const written = (kind: TailoredExperience['kind'], id: string) =>
    data.experiences.find((e) => e.kind === kind && e.sourceId === id)?.bullets ?? [];
  const selected = (kind: TailoredExperience['kind'], id: string) =>
    (kind === 'POSITION' ? selection?.positions : selection?.projects)?.find((s) => s.id === id);
  const bulletsOf = (kind: TailoredExperience['kind'], id: string) => {
    const bullets = written(kind, id);
    const chosen = selected(kind, id);
    const ordered = !selection
      ? bullets
      : (chosen?.bulletIds ?? []).flatMap((bulletId) => bullets.filter((b) => b.id === bulletId));
    return ordered.map((b) => b.text.trim()).filter((text) => text !== '');
  };

  const toolNames = new Map(
    [...profile.positions, ...profile.projects].flatMap((e) => [
      ...e.tools.map((t) => [t.id, t.name] as const),
      ...e.achievements.flatMap((a) => a.tools.map((t) => [t.id, t.name] as const)),
    ]),
  );
  const skills = data.toolIds.flatMap((id) => {
    const toolName = orNull(toolNames.get(id));
    return toolName ? [toolName] : [];
  });

  return {
    language,
    paper,
    basics: {
      name,
      headline: orNull(info.headline),
      location: orNull(info.location),
      email: orNull(info.email),
      phone: orNull(info.phone),
      links: info.links.map((link) => ({ url: link.url, label: orNull(link.label) })),
    },
    summary: orNull(data.summary?.text),
    experience: [...profile.positions].sort(byRecency).map((p) => ({
      company: p.company,
      title: p.title,
      location: orNull(p.location),
      startDate: p.startDate,
      endDate: p.endDate,
      bullets: bulletsOf('POSITION', p.id),
    })),
    projects: [...profile.projects]
      .map((p) => ({ project: p, bullets: bulletsOf('PROJECT', p.id) }))
      .filter(({ project, bullets }) =>
        selection
          ? selected('PROJECT', project.id) !== undefined && bullets.length > 0
          : bullets.length > 0,
      )
      .sort((a, b) => byRecency(a.project, b.project))
      .map(({ project: p, bullets }) => ({
        name: p.name,
        role: orNull(p.role),
        url: httpUrl(p.url),
        startDate: p.startDate,
        endDate: p.endDate,
        bullets,
      })),
    skills: skills.length > 0 ? [{ label: null, items: skills }] : [],
    education: profile.education.map((e) => ({
      institution: e.institution,
      title: e.title,
      field: orNull(e.field),
      startDate: e.startDate,
      endDate: e.endDate,
    })),
    certifications: profile.certifications.map((c) => ({
      name: c.name,
      issuer: orNull(c.issuer),
      issueDate: c.issueDate,
    })),
    languages: profile.languages.map((l) => ({ language: l.language, level: l.level })),
  };
}

export function findExperience(
  profile: Profile,
  kind: 'POSITION' | 'PROJECT',
  id: string,
): Position | Project | undefined {
  const list: (Position | Project)[] = kind === 'POSITION' ? profile.positions : profile.projects;
  return list.find((e) => e.id === id);
}

/** Every id a summary may cite. */
function profileElementIds(profile: Profile): Set<string> {
  const ids = new Set<string>();
  for (const e of [...profile.positions, ...profile.projects]) {
    ids.add(e.id);
    for (const a of e.achievements) ids.add(a.id);
  }
  for (const list of [profile.education, profile.certifications, profile.languages]) {
    for (const item of list) ids.add(item.id);
  }
  return ids;
}

/** Current first, then by end date and start date, the latest first; undated last. */
function byRecency(
  a: { startDate: string | null; endDate: string | null },
  b: { startDate: string | null; endDate: string | null },
): number {
  const end = (e: typeof a) =>
    e.endDate === null ? (e.startDate === null ? '' : '9999-12') : e.endDate;
  return end(b).localeCompare(end(a)) || (b.startDate ?? '').localeCompare(a.startDate ?? '');
}

function orNull(text: string | null | undefined): string | null {
  const trimmed = text?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

function httpUrl(url: string | null): string | null {
  const value = orNull(url);
  return value && /^https?:\/\//i.test(value) ? value : null;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
