import type { CvImportDraft, Profile } from '@careerly/contracts';
import { describe, expect, it } from 'vitest';
import {
  newToolNames,
  reviewIssues,
  selectionCount,
  toConfirmRequest,
  toReview,
} from './cv-import-review';

const EMPTY_PROFILE: Profile = {
  personalInfo: {
    firstNames: null,
    lastNames: null,
    headline: null,
    location: null,
    email: null,
    phone: null,
    summary: null,
    links: [],
    updatedAt: null,
  },
  positions: [],
  projects: [],
  education: [],
  certifications: [],
  languages: [],
};

const go = { name: 'Go', toolId: 'go', toolName: 'Go' };
const inHouse = { name: 'LedgerKit', toolId: null, toolName: null };

const DRAFT: CvImportDraft = {
  personalInfo: {
    firstNames: 'Lucía',
    lastNames: 'Fernández Gómez',
    headline: 'Backend Developer',
    location: null,
    email: 'lucia@example.com',
    phone: null,
    summary: null,
    links: [{ kind: 'GITHUB', url: 'https://github.com/lucia', label: null }],
  },
  positions: [
    {
      company: 'Acme',
      title: 'Backend Developer',
      location: null,
      workMode: 'REMOTE',
      startDate: '2021-03',
      endDate: null,
      context: null,
      tools: [go],
      achievements: [
        { text: 'Built the settlement service.', metrics: '2M tx/day', tools: [go, inHouse] },
        { text: 'Mentored two juniors.', metrics: null, tools: [] },
      ],
    },
    {
      company: 'Initech',
      title: 'Developer',
      location: null,
      workMode: null,
      startDate: null,
      endDate: '2021-02',
      context: null,
      tools: [{ name: 'ledgerkit', toolId: null, toolName: null }],
      achievements: [],
    },
  ],
  projects: [],
  education: [],
  certifications: [],
  languages: [{ language: 'English', level: 'C1', notes: 'advanced' }],
};

describe('toReview', () => {
  it('includes everything new, but never replaces what the profile already has', () => {
    const profile: Profile = {
      ...EMPTY_PROFILE,
      personalInfo: {
        ...EMPTY_PROFILE.personalInfo,
        headline: 'Staff Engineer',
        links: [{ kind: 'GITHUB', url: 'https://www.github.com/lucia/', label: null }],
      },
    };
    const review = toReview(DRAFT, profile);

    expect(review.personal.firstNames).toEqual({ value: 'Lucía', include: true, current: null });
    expect(review.personal.headline).toEqual({
      value: 'Backend Developer',
      include: false,
      current: 'Staff Engineer',
    });
    expect(review.personal.phone.include).toBe(false);
    // The GitHub link is already there (same URL, written differently).
    expect(review.links).toEqual([]);
    expect(review.positions.every((position) => position.include)).toBe(true);
    expect(review.positions[0]!.achievements[0]!.tools.map((tool) => tool.label)).toEqual([
      'Go',
      'LedgerKit',
    ]);
  });
});

describe('reviewIssues', () => {
  it('asks for what the API requires, only on included elements', () => {
    const review = toReview(DRAFT, EMPTY_PROFILE);
    const initech = review.positions[1]!;
    expect(reviewIssues(review).get(initech.key)).toEqual(['startDateRequired']);

    initech.startDate = '2022-01';
    expect(reviewIssues(review).get(initech.key)).toEqual(['dateOrder']);

    initech.include = false;
    review.positions[0]!.achievements[1]!.text = '  ';
    review.personal.email.value = 'not-an-email';
    review.links[0]!.url = 'github.com/lucia';
    const issues = reviewIssues(review);
    expect(issues.has(initech.key)).toBe(false);
    expect(issues.get(review.positions[0]!.achievements[1]!.key)).toEqual(['required']);
    expect(issues.get('personal.email')).toEqual(['invalidEmail']);
    expect(issues.get(review.links[0]!.key)).toEqual(['invalidUrl']);
  });
});

describe('building the confirmation', () => {
  it('creates each unknown tool once and sends only what is included', () => {
    const review = toReview(DRAFT, EMPTY_PROFILE);
    review.positions[1]!.startDate = '2019-05';
    review.positions[0]!.achievements[1]!.include = false;
    review.languages[0]!.include = false;

    expect(newToolNames(review)).toEqual(['LedgerKit']);
    expect(selectionCount(review)).toBe(1 + 2 + 1);

    const request = toConfirmRequest(review, new Map([['ledgerkit', 'user-ledgerkit']]));
    expect(request.personalInfo).toEqual({
      firstNames: 'Lucía',
      lastNames: 'Fernández Gómez',
      headline: 'Backend Developer',
      email: 'lucia@example.com',
      links: [{ kind: 'GITHUB', url: 'https://github.com/lucia', label: null }],
    });
    expect(request.positions).toEqual([
      {
        company: 'Acme',
        title: 'Backend Developer',
        location: null,
        workMode: 'REMOTE',
        startDate: '2021-03',
        endDate: null,
        context: null,
        toolIds: ['go'],
        achievements: [
          {
            text: 'Built the settlement service.',
            metrics: '2M tx/day',
            toolIds: ['go', 'user-ledgerkit'],
          },
        ],
      },
      expect.objectContaining({ company: 'Initech', toolIds: ['user-ledgerkit'] }),
    ]);
    expect(request.languages).toEqual([]);
  });

  it('keeps the links the profile already has', () => {
    const current = {
      kind: 'LINKEDIN' as const,
      url: 'https://linkedin.com/in/lucia',
      label: null,
    };
    const review = toReview(DRAFT, {
      ...EMPTY_PROFILE,
      personalInfo: { ...EMPTY_PROFILE.personalInfo, links: [current] },
    });
    expect(toConfirmRequest(review, new Map()).personalInfo?.links).toEqual([
      current,
      { kind: 'GITHUB', url: 'https://github.com/lucia', label: null },
    ]);
  });
});
