import type {
  ConfirmCvImportRequest,
  CvImportDraft,
  DraftTool,
  EducationKind,
  LanguageLevel,
  LinkKind,
  Profile,
  ProfileLink,
  ProjectKind,
  WorkMode,
} from '@careerly/contracts';
import { z } from 'zod';

/*
 * The review step of the CV import (RF-PROF-09): the draft read by the AI becomes editable state
 * (strings, '' for empty, an `include` flag per element), is validated, and is turned into the
 * confirmation request. Pure functions: the page only renders and edits this state.
 */

export interface ReviewTool {
  /** As written in the CV. */
  name: string;
  /** Catalog id, or `null` for a tool that will be created when saving. */
  toolId: string | null;
  /** What to show: the catalog name when resolved, else the CV name. */
  label: string;
}

interface Reviewable {
  /** Stable key for React and for validation issues. */
  key: string;
  include: boolean;
}

export interface ReviewAchievement extends Reviewable {
  text: string;
  metrics: string;
  tools: ReviewTool[];
}

export interface ReviewPosition extends Reviewable {
  company: string;
  title: string;
  location: string;
  workMode: WorkMode | null;
  startDate: string;
  /** '' = current job. */
  endDate: string;
  context: string;
  tools: ReviewTool[];
  achievements: ReviewAchievement[];
}

export interface ReviewProject extends Reviewable {
  name: string;
  kind: ProjectKind;
  role: string;
  url: string;
  startDate: string;
  endDate: string;
  description: string;
  tools: ReviewTool[];
  achievements: ReviewAchievement[];
}

export interface ReviewEducation extends Reviewable {
  institution: string;
  title: string;
  kind: EducationKind;
  field: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface ReviewCertification extends Reviewable {
  name: string;
  issuer: string;
  issueDate: string;
  expirationDate: string;
  credentialId: string;
  url: string;
}

export interface ReviewLanguage extends Reviewable {
  language: string;
  level: LanguageLevel;
  notes: string;
}

export const PERSONAL_FIELDS = [
  'firstNames',
  'lastNames',
  'headline',
  'location',
  'email',
  'phone',
  'summary',
] as const;
export type PersonalField = (typeof PERSONAL_FIELDS)[number];

export interface ReviewPersonalField {
  value: string;
  include: boolean;
  /** What the profile has now (shown when the import would replace it). */
  current: string | null;
}

export interface ReviewLink extends Reviewable {
  kind: LinkKind;
  url: string;
  label: string;
}

export interface CvReview {
  personal: Record<PersonalField, ReviewPersonalField>;
  /** New links; the ones already in the profile are kept. */
  links: ReviewLink[];
  currentLinks: ProfileLink[];
  positions: ReviewPosition[];
  projects: ReviewProject[];
  education: ReviewEducation[];
  certifications: ReviewCertification[];
  languages: ReviewLanguage[];
}

const text = (value: string | null) => value ?? '';
const toTools = (tools: DraftTool[]): ReviewTool[] =>
  tools.map(({ name, toolId, toolName }) => ({ name, toolId, label: toolName ?? name }));

/** Turns the AI draft into review state. `current` is the profile as it is now. */
export function toReview(draft: CvImportDraft, current: Profile): CvReview {
  let next = 0;
  const key = (prefix: string) => `${prefix}-${next++}`;
  const achievements = (items: CvImportDraft['positions'][number]['achievements']) =>
    items.map((item) => ({
      key: key('achievement'),
      include: true,
      text: item.text,
      metrics: text(item.metrics),
      tools: toTools(item.tools),
    }));

  const personal = Object.fromEntries(
    PERSONAL_FIELDS.map((field) => {
      const value = text(draft.personalInfo[field]).trim();
      const now = current.personalInfo[field];
      // Never replace what the user already has without them asking for it.
      return [field, { value, include: value !== '' && !now, current: now }];
    }),
  ) as CvReview['personal'];

  const knownUrls = new Set(current.personalInfo.links.map((link) => normalizeUrl(link.url)));

  return {
    personal,
    links: draft.personalInfo.links
      .filter((link) => !knownUrls.has(normalizeUrl(link.url)))
      .map((link) => ({
        key: key('link'),
        include: true,
        kind: link.kind,
        url: link.url,
        label: text(link.label),
      })),
    currentLinks: current.personalInfo.links,
    positions: draft.positions.map((item) => ({
      key: key('position'),
      include: true,
      company: item.company,
      title: item.title,
      location: text(item.location),
      workMode: item.workMode,
      startDate: text(item.startDate),
      endDate: text(item.endDate),
      context: text(item.context),
      tools: toTools(item.tools),
      achievements: achievements(item.achievements),
    })),
    projects: draft.projects.map((item) => ({
      key: key('project'),
      include: true,
      name: item.name,
      kind: item.kind,
      role: text(item.role),
      url: text(item.url),
      startDate: text(item.startDate),
      endDate: text(item.endDate),
      description: text(item.description),
      tools: toTools(item.tools),
      achievements: achievements(item.achievements),
    })),
    education: draft.education.map((item) => ({
      key: key('education'),
      include: true,
      institution: item.institution,
      title: item.title,
      kind: item.kind,
      field: text(item.field),
      startDate: text(item.startDate),
      endDate: text(item.endDate),
      description: text(item.description),
    })),
    certifications: draft.certifications.map((item) => ({
      key: key('certification'),
      include: true,
      name: item.name,
      issuer: text(item.issuer),
      issueDate: text(item.issueDate),
      expirationDate: text(item.expirationDate),
      credentialId: text(item.credentialId),
      url: text(item.url),
    })),
    languages: draft.languages.map((item) => ({
      key: key('language'),
      include: true,
      language: item.language,
      level: item.level,
      notes: text(item.notes),
    })),
  };
}

function normalizeUrl(url: string) {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/\/+$/, '');
}

// --- Validation ---------------------------------------------------------------------

/** Problems the user must fix (or exclude the element) before saving; i18n keys. */
export type ReviewIssue =
  'required' | 'startDateRequired' | 'dateOrder' | 'invalidUrl' | 'invalidEmail';

const isUrl = (value: string) => z.url({ protocol: /^https?$/ }).safeParse(value).success;
const isEmail = (value: string) => z.email().safeParse(value).success;
const blank = (value: string) => value.trim() === '';

function dateIssues(start: string, end: string): ReviewIssue[] {
  return start && end && end < start ? ['dateOrder'] : [];
}

/** Issues by element key (personal fields use `personal.<field>`). Only included elements count. */
export function reviewIssues(review: CvReview): Map<string, ReviewIssue[]> {
  const issues = new Map<string, ReviewIssue[]>();
  const add = (key: string, found: ReviewIssue[]) => {
    if (found.length > 0) issues.set(key, found);
  };
  const achievements = (items: ReviewAchievement[]) => {
    for (const item of items) {
      if (item.include) add(item.key, blank(item.text) ? ['required'] : []);
    }
  };

  const email = review.personal.email;
  if (email.include && !blank(email.value) && !isEmail(email.value.trim())) {
    add('personal.email', ['invalidEmail']);
  }
  for (const link of review.links) {
    if (link.include) add(link.key, isUrl(link.url.trim()) ? [] : ['invalidUrl']);
  }

  for (const item of review.positions.filter((position) => position.include)) {
    add(item.key, [
      ...(blank(item.company) || blank(item.title) ? (['required'] as const) : []),
      ...(item.startDate ? [] : (['startDateRequired'] as const)),
      ...dateIssues(item.startDate, item.endDate),
    ]);
    achievements(item.achievements);
  }
  for (const item of review.projects.filter((project) => project.include)) {
    add(item.key, [
      ...(blank(item.name) ? (['required'] as const) : []),
      ...(blank(item.url) || isUrl(item.url.trim()) ? [] : (['invalidUrl'] as const)),
      ...dateIssues(item.startDate, item.endDate),
    ]);
    achievements(item.achievements);
  }
  for (const item of review.education.filter((education) => education.include)) {
    add(item.key, [
      ...(blank(item.institution) || blank(item.title) ? (['required'] as const) : []),
      ...dateIssues(item.startDate, item.endDate),
    ]);
  }
  for (const item of review.certifications.filter((certification) => certification.include)) {
    add(item.key, [
      ...(blank(item.name) ? (['required'] as const) : []),
      ...(blank(item.url) || isUrl(item.url.trim()) ? [] : (['invalidUrl'] as const)),
      ...dateIssues(item.issueDate, item.expirationDate),
    ]);
  }
  for (const item of review.languages.filter((language) => language.include)) {
    add(item.key, blank(item.language) ? ['required'] : []);
  }
  return issues;
}

// --- Building the confirmation --------------------------------------------------------

function includedContainers(review: CvReview) {
  return [...review.positions, ...review.projects].filter((item) => item.include);
}

/** Tools without a catalog id in the included elements, once each (case-insensitive). */
export function newToolNames(review: CvReview): string[] {
  const names = new Map<string, string>();
  for (const container of includedContainers(review)) {
    const tools = [
      ...container.tools,
      ...container.achievements.filter((item) => item.include).flatMap((item) => item.tools),
    ];
    for (const tool of tools) {
      const name = tool.name.trim();
      if (tool.toolId === null && name && !names.has(name.toLowerCase())) {
        names.set(name.toLowerCase(), name);
      }
    }
  }
  return [...names.values()];
}

/** How many elements will be saved. */
export function selectionCount(review: CvReview): number {
  const included = <T extends Reviewable>(items: T[]) => items.filter((item) => item.include);
  const personal = PERSONAL_FIELDS.some(
    (field) => review.personal[field].include && !blank(review.personal[field].value),
  );
  return (
    (personal || included(review.links).length > 0 ? 1 : 0) +
    included(review.positions).length +
    included(review.projects).length +
    includedContainers(review).reduce(
      (total, container) => total + included(container.achievements).length,
      0,
    ) +
    included(review.education).length +
    included(review.certifications).length +
    included(review.languages).length
  );
}

const orNull = (value: string) => (blank(value) ? null : value.trim());

/**
 * The confirmation request. `toolIds` maps the lowercase CV name of each new tool to the id it got
 * when it was created.
 */
export function toConfirmRequest(
  review: CvReview,
  toolIds: ReadonlyMap<string, string>,
): ConfirmCvImportRequest {
  const ids = (tools: ReviewTool[]) => [
    ...new Set(
      tools
        .map((tool) => tool.toolId ?? toolIds.get(tool.name.trim().toLowerCase()))
        .filter((id): id is string => id !== undefined),
    ),
  ];
  const achievements = (items: ReviewAchievement[]) =>
    items
      .filter((item) => item.include)
      .map((item) => ({
        text: item.text.trim(),
        metrics: orNull(item.metrics),
        toolIds: ids(item.tools),
      }));

  const personalInfo: NonNullable<ConfirmCvImportRequest['personalInfo']> = {};
  for (const field of PERSONAL_FIELDS) {
    const { value, include } = review.personal[field];
    if (include && !blank(value)) personalInfo[field] = value.trim();
  }
  const newLinks = review.links.filter((link) => link.include);
  if (newLinks.length > 0) {
    personalInfo.links = [
      ...review.currentLinks,
      ...newLinks.map((link) => ({
        kind: link.kind,
        url: link.url.trim(),
        label: orNull(link.label),
      })),
    ];
  }

  return {
    ...(Object.keys(personalInfo).length > 0 ? { personalInfo } : {}),
    positions: review.positions
      .filter((item) => item.include)
      .map((item) => ({
        company: item.company.trim(),
        title: item.title.trim(),
        location: orNull(item.location),
        workMode: item.workMode,
        startDate: item.startDate,
        endDate: orNull(item.endDate),
        context: orNull(item.context),
        toolIds: ids(item.tools),
        achievements: achievements(item.achievements),
      })),
    projects: review.projects
      .filter((item) => item.include)
      .map((item) => ({
        name: item.name.trim(),
        kind: item.kind,
        role: orNull(item.role),
        url: orNull(item.url),
        startDate: orNull(item.startDate),
        endDate: orNull(item.endDate),
        description: orNull(item.description),
        toolIds: ids(item.tools),
        achievements: achievements(item.achievements),
      })),
    education: review.education
      .filter((item) => item.include)
      .map((item) => ({
        institution: item.institution.trim(),
        title: item.title.trim(),
        kind: item.kind,
        field: orNull(item.field),
        startDate: orNull(item.startDate),
        endDate: orNull(item.endDate),
        description: orNull(item.description),
      })),
    certifications: review.certifications
      .filter((item) => item.include)
      .map((item) => ({
        name: item.name.trim(),
        issuer: orNull(item.issuer),
        issueDate: orNull(item.issueDate),
        expirationDate: orNull(item.expirationDate),
        credentialId: orNull(item.credentialId),
        url: orNull(item.url),
      })),
    languages: review.languages
      .filter((item) => item.include)
      .map((item) => ({
        language: item.language.trim(),
        level: item.level,
        notes: orNull(item.notes),
      })),
  };
}
