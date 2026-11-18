import type { Profile, TailoredResumeData } from '@careerly/contracts';
import { describe, expect, it } from 'vitest';
import { fitToPages } from './page-fitter.js';
import { fitCandidates } from './resume-fit.js';
import { buildResumeDocument } from './resume-writing.js';

const provenance = {
  origin: 'MANUAL',
  originSessionId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as const;

const experience = (id: string, startDate: string | null, endDate: string | null) => ({
  id,
  startDate,
  endDate,
  tools: [],
  achievements: [],
  ...provenance,
});

const PROFILE = {
  personalInfo: {
    firstNames: 'Ana',
    lastNames: 'García',
    headline: null,
    location: null,
    email: null,
    phone: null,
    summary: null,
    links: [],
    updatedAt: null,
  },
  positions: [
    { ...experience('now', '2022-01', null), company: 'Now', title: 'Dev', location: null },
    { ...experience('old', '2008-01', '2011-12'), company: 'Old', title: 'Dev', location: null },
  ],
  projects: [
    { ...experience('p1', null, null), name: 'P1', role: null, url: null },
    { ...experience('p2', null, null), name: 'P2', role: null, url: null },
  ],
  education: [],
  certifications: [],
  languages: [],
} as unknown as Profile;

const bullet = (id: string, score: number | null = null) => ({
  id,
  text: `Text ${id}`,
  sourceIds: ['a'],
  score,
  editedByUser: false,
});

const DATA: TailoredResumeData = {
  summary: null,
  experiences: [
    {
      kind: 'POSITION',
      sourceId: 'now',
      bullets: ['n1', 'n2', 'n3', 'n4'].map((id) => bullet(id)),
    },
    { kind: 'POSITION', sourceId: 'old', bullets: [bullet('o1')] },
    { kind: 'PROJECT', sourceId: 'p1', bullets: [bullet('q1', 0.2), bullet('q2', 0.9)] },
  ],
  toolIds: [],
  guard: { rewritten: 0, dropped: [] },
  fit: null,
};

describe('fitCandidates', () => {
  it('lists every position, the projects with bullets, and scores by the order written', () => {
    expect(fitCandidates(DATA, PROFILE)).toEqual({
      positions: [
        {
          id: 'now',
          startDate: '2022-01',
          endDate: null,
          bullets: [
            { id: 'n1', score: 1 },
            { id: 'n2', score: 0.75 },
            { id: 'n3', score: 0.5 },
            { id: 'n4', score: 0.25 },
          ],
        },
        { id: 'old', startDate: '2008-01', endDate: '2011-12', bullets: [{ id: 'o1', score: 1 }] },
      ],
      // p2 has no bullets; p1 keeps its relevance scores (roadmap 6.2).
      projects: [
        {
          id: 'p1',
          relevant: true,
          bullets: [
            { id: 'q1', score: 0.2 },
            { id: 'q2', score: 0.9 },
          ],
        },
      ],
    });
  });

  it('trims the least relevant bullets until the CV fits (RN-04)', async () => {
    // A fake renderer: one page per three bullets, plus the headers.
    const measure = async (selection: {
      positions: { bulletIds: string[] }[];
      projects: { bulletIds: string[] }[];
    }) =>
      Math.ceil(
        ([...selection.positions, ...selection.projects].flatMap((o) => o.bulletIds).length + 1) /
          3,
      );
    const fit = await fitToPages(fitCandidates(DATA, PROFILE), measure, {
      pageBudget: 1,
      today: '2026-11',
    });
    expect(fit).toMatchObject({ pageCount: 1, fits: true });
    expect(fit.selection).toEqual({
      positions: [
        { id: 'now', bulletIds: ['n1'] },
        // Older than ten years: only company, title and dates (RN-07).
        { id: 'old', bulletIds: [] },
      ],
      projects: [{ id: 'p1', bulletIds: ['q2'] }],
    });
    expect(fit.log).toContainEqual({
      owner: { type: 'position', id: 'old' },
      bulletId: 'o1',
      action: 'LEFT_OUT',
      reason: 'OLD_POSITION',
    });
  });
});

describe('buildResumeDocument with a selection', () => {
  it('shows the selected bullets in their order and only the selected projects', () => {
    const document = buildResumeDocument({
      data: DATA,
      profile: PROFILE,
      language: 'en',
      paper: 'a4',
      selection: {
        positions: [
          { id: 'now', bulletIds: ['n3', 'n1'] },
          { id: 'old', bulletIds: [] },
        ],
        projects: [],
      },
    });
    expect(document.experience.map((p) => p.bullets)).toEqual([['Text n3', 'Text n1'], []]);
    expect(document.projects).toEqual([]);
  });

  it('uses the CV’s own fit by default, and every bullet without one', () => {
    const fitted = {
      ...DATA,
      fit: {
        selection: {
          positions: [{ id: 'now', bulletIds: ['n2'] }],
          projects: [{ id: 'p1', bulletIds: ['q2', 'q1'] }],
        },
        pageCount: 1,
        fits: true,
        pageBudget: 1 as const,
        log: [],
      },
    };
    const byDefault = buildResumeDocument({
      data: fitted,
      profile: PROFILE,
      language: 'en',
      paper: 'a4',
    });
    expect(byDefault.experience.map((p) => p.bullets)).toEqual([['Text n2'], []]);
    expect(byDefault.projects.map((p) => p.bullets)).toEqual([['Text q2', 'Text q1']]);

    const unfitted = buildResumeDocument({
      data: DATA,
      profile: PROFILE,
      language: 'en',
      paper: 'a4',
    });
    expect(unfitted.experience[0]!.bullets).toHaveLength(4);
  });
});
