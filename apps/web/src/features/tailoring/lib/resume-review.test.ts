import type { Profile, TailoredResumeData } from '@careerly/contracts';
import { describe, expect, it } from 'vitest';
import { reviewExperiences } from './resume-review';

const provenance = {
  origin: 'MANUAL',
  originSessionId: null,
  createdAt: '2026-11-17T12:00:00.000Z',
  updatedAt: '2026-11-17T12:00:00.000Z',
} as const;

const position = (id: string, company: string, startDate: string, endDate: string | null) => ({
  id,
  company,
  title: 'Developer',
  location: null,
  workMode: null,
  startDate,
  endDate,
  context: null,
  tools: [],
  achievements: [
    { id: `${id}-a1`, text: `Achievement of ${company}`, metrics: null, tools: [], ...provenance },
  ],
  ...provenance,
});

const PROFILE = {
  personalInfo: {
    firstNames: 'Ana',
    lastNames: null,
    headline: null,
    location: null,
    email: null,
    phone: null,
    summary: null,
    links: [],
    updatedAt: null,
  },
  positions: [
    position('old', 'Old Co', '2010-01', '2012-12'),
    position('now', 'Now Co', '2022-01', null),
  ],
  projects: [
    {
      id: 'p1',
      name: 'CLI tool',
      kind: 'PERSONAL',
      role: null,
      url: null,
      startDate: null,
      endDate: null,
      description: null,
      tools: [],
      achievements: [],
      ...provenance,
    },
  ],
  education: [],
  certifications: [],
  languages: [],
} satisfies Profile;

const bullet = (
  id: string,
  sourceIds: string[],
  inclusion: 'AUTO' | 'INCLUDED' | 'EXCLUDED' = 'AUTO',
) => ({ id, text: `Text ${id}`, sourceIds, score: null, editedByUser: false, inclusion });

const DATA: TailoredResumeData = {
  summary: null,
  experiences: [
    {
      kind: 'POSITION',
      sourceId: 'now',
      bullets: [
        bullet('b1', ['now-a1']),
        bullet('b2', ['now-a1', 'gone']),
        bullet('b3', ['now-a1'], 'EXCLUDED'),
      ],
    },
    { kind: 'POSITION', sourceId: 'old', bullets: [bullet('b4', ['old-a1'])] },
    { kind: 'PROJECT', sourceId: 'p1', bullets: [bullet('b5', ['p1'])] },
  ],
  toolIds: [],
  guard: { rewritten: 0, dropped: [] },
  fit: {
    selection: {
      positions: [
        { id: 'now', bulletIds: ['b1'] },
        { id: 'old', bulletIds: [] },
      ],
      projects: [{ id: 'p1', bulletIds: ['b5'] }],
    },
    pageCount: 1,
    fits: true,
    pageBudget: 1,
    log: [
      {
        owner: { type: 'position', id: 'now' },
        bulletId: 'b2',
        action: 'LEFT_OUT',
        reason: 'OVER_BUDGET',
      },
      {
        owner: { type: 'position', id: 'old' },
        bulletId: 'b4',
        action: 'LEFT_OUT',
        reason: 'OLD_POSITION',
      },
    ],
  },
};

describe('reviewExperiences', () => {
  it('lists positions newest first, then projects, with each bullet’s state and sources', () => {
    const experiences = reviewExperiences(DATA, PROFILE);

    expect(experiences.map((e) => [e.kind, e.title])).toEqual([
      ['POSITION', 'Developer · Now Co'],
      ['POSITION', 'Developer · Old Co'],
      ['PROJECT', 'CLI tool'],
    ]);
    const [now, old, project] = experiences;
    expect(now!.bullets.map((b) => [b.bullet.id, b.index, b.state])).toEqual([
      ['b1', 0, { kind: 'IN' }],
      ['b2', 1, { kind: 'LEFT_OUT', reason: 'OVER_BUDGET' }],
      ['b3', 2, { kind: 'EXCLUDED' }],
    ]);
    expect(old!.bullets[0]!.state).toEqual({ kind: 'LEFT_OUT', reason: 'OLD_POSITION' });
    // Sources: an achievement, one deleted since, and a project citing itself.
    expect(now!.bullets[1]!.sources.map((s) => s?.text ?? null)).toEqual([
      'Achievement of Now Co',
      null,
    ]);
    expect(project!.bullets[0]!.sources[0]).toMatchObject({ text: 'CLI tool' });
  });

  it('shows every bullet as in the CV before the fit, and leaves out projects without bullets', () => {
    const experiences = reviewExperiences(
      { ...DATA, fit: null, experiences: DATA.experiences.slice(0, 1) },
      PROFILE,
    );
    expect(experiences.map((e) => e.id)).toEqual(['now', 'old']);
    expect(experiences[0]!.bullets.map((b) => b.state.kind)).toEqual(['IN', 'IN', 'EXCLUDED']);
    expect(experiences[1]!.bullets).toEqual([]);
  });
});
