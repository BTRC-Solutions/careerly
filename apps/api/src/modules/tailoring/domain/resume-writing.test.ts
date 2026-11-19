import type { MatchResult, Position, Profile, Project } from '@careerly/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildResumeDocument,
  MAX_BULLETS_PER_EXPERIENCE,
  ResumeWithoutNameError,
  selectSkills,
  tailoredResumeData,
  type WrittenResume,
} from './resume-writing.js';

const provenance = {
  origin: 'MANUAL',
  originSessionId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as const;

const tool = (id: string) => ({ id, name: id.toUpperCase() });
const achievement = (id: string, tools: string[] = []) => ({
  id,
  text: `Achievement ${id}`,
  metrics: null,
  tools: tools.map(tool),
  ...provenance,
});

function position(id: string, fields: Partial<Position> = {}): Position {
  return {
    id,
    company: `Company ${id}`,
    title: `Title ${id}`,
    location: null,
    workMode: null,
    startDate: '2020-01',
    endDate: null,
    context: null,
    tools: [],
    achievements: [],
    ...provenance,
    ...fields,
  } as Position;
}

function project(id: string, fields: Partial<Project> = {}): Project {
  return {
    id,
    name: `Project ${id}`,
    kind: 'PERSONAL',
    role: null,
    url: null,
    startDate: null,
    endDate: null,
    description: null,
    tools: [],
    achievements: [],
    ...provenance,
    ...fields,
  } as Project;
}

const PROFILE = {
  personalInfo: {
    firstNames: 'Ana',
    lastNames: ' García ',
    headline: 'Backend Engineer',
    location: '',
    email: 'ana@example.com',
    phone: null,
    summary: null,
    links: [{ kind: 'GITHUB', url: 'https://github.com/ana', label: '' }],
    updatedAt: null,
  },
  positions: [
    position('old', {
      startDate: '2012-01',
      endDate: '2015-06',
      achievements: [achievement('a-old')],
    }),
    position('now', {
      startDate: '2021-03',
      endDate: null,
      tools: [tool('docker')],
      achievements: [achievement('a1', ['node']), achievement('a2', ['node', 'pg'])],
    }),
    position('prev', {
      startDate: '2016-01',
      endDate: '2021-02',
      achievements: [achievement('a3', ['java'])],
    }),
  ],
  projects: [
    project('p1', { url: 'github.com/ana/p1', achievements: [achievement('pa1')] }),
    project('p2'),
  ],
  education: [
    {
      id: 'e1',
      institution: 'UBA',
      title: 'Ingeniería',
      kind: 'DEGREE',
      field: null,
      startDate: null,
      endDate: '2014-12',
      description: null,
      ...provenance,
    },
  ],
  certifications: [],
  languages: [{ id: 'l1', language: 'English', level: 'C1', notes: null, ...provenance }],
} as unknown as Profile;

const ids = () => {
  let n = 0;
  return () => `b${++n}`;
};

describe('tailoredResumeData', () => {
  it('keeps only bullets whose sources belong to their own experience (RN-01)', () => {
    const written: WrittenResume = {
      summary: { text: '  Summary.  ', sourceIds: ['now', 'a1', 'nope', 'a1'] },
      experiences: [
        {
          kind: 'POSITION',
          sourceId: 'now',
          bullets: [
            { text: ' Built the API ', sourceIds: ['a1', 'a2', 'a1'] },
            // An achievement of another position, and an unknown one: no source left.
            { text: 'Borrowed', sourceIds: ['a3', 'x'] },
            { text: '   ', sourceIds: ['a1'] },
            // The position itself is not a valid source for a bullet.
            { text: 'From the position', sourceIds: ['now'] },
          ],
        },
        { kind: 'POSITION', sourceId: 'ghost', bullets: [{ text: 'Ghost', sourceIds: ['a1'] }] },
        // A project may cite itself.
        { kind: 'PROJECT', sourceId: 'p2', bullets: [{ text: 'Side project', sourceIds: ['p2'] }] },
        // The same experience again is merged.
        { kind: 'POSITION', sourceId: 'now', bullets: [{ text: 'More', sourceIds: ['a2'] }] },
      ],
    };

    const { data, stats } = tailoredResumeData(written, PROFILE, null, ids());

    expect(data.summary).toEqual({ text: 'Summary.', sourceIds: ['now', 'a1'] });
    expect(data.experiences).toEqual([
      {
        kind: 'POSITION',
        sourceId: 'now',
        bullets: [
          {
            id: 'b1',
            text: 'Built the API',
            sourceIds: ['a1', 'a2'],
            score: null,
            editedByUser: false,
          },
          { id: 'b3', text: 'More', sourceIds: ['a2'], score: null, editedByUser: false },
        ],
      },
      {
        kind: 'PROJECT',
        sourceId: 'p2',
        bullets: [
          { id: 'b2', text: 'Side project', sourceIds: ['p2'], score: null, editedByUser: false },
        ],
      },
    ]);
    expect(stats).toEqual({ bullets: 3, droppedBullets: 4, droppedSources: 3 });
  });

  it('caps the bullets of an experience and leaves out an empty summary', () => {
    const bullets = Array.from({ length: MAX_BULLETS_PER_EXPERIENCE + 2 }, (_, i) => ({
      text: `Bullet ${i}`,
      sourceIds: ['a1'],
    }));
    const { data } = tailoredResumeData(
      {
        summary: { text: ' ', sourceIds: [] },
        experiences: [{ kind: 'POSITION', sourceId: 'now', bullets }],
      },
      PROFILE,
      null,
      ids(),
    );
    expect(data.summary).toBeNull();
    expect(data.experiences[0]!.bullets).toHaveLength(MAX_BULLETS_PER_EXPERIENCE);
  });
});

describe('selectSkills', () => {
  it('puts the tools the job description asks for first, then the most used', () => {
    const match = {
      requirements: [
        { tool: { id: 'pg', name: 'PG' }, status: 'PARTIAL' },
        { tool: { id: 'rust', name: 'RUST' }, status: 'MISSING' },
        { tool: { id: 'java', name: 'JAVA' }, status: 'COVERED' },
        { tool: null, status: 'COVERED' },
      ],
    } as unknown as MatchResult;
    // node: 2 achievements (4), pg: 1 (2), java: 1 (2), docker: listed (1).
    expect(selectSkills(PROFILE, match)).toEqual(['pg', 'java', 'node', 'docker']);
    expect(selectSkills(PROFILE, null)).toEqual(['node', 'pg', 'java', 'docker']);
  });
});

describe('buildResumeDocument', () => {
  const data = {
    summary: { text: 'Summary.', sourceIds: [] },
    experiences: [
      {
        kind: 'POSITION' as const,
        sourceId: 'now',
        bullets: [
          { id: 'b1', text: 'Built the API', sourceIds: ['a1'], score: null, editedByUser: false },
        ],
      },
      {
        kind: 'PROJECT' as const,
        sourceId: 'p1',
        bullets: [
          { id: 'b2', text: 'Wrote a CLI', sourceIds: ['pa1'], score: null, editedByUser: false },
        ],
      },
    ],
    toolIds: ['node', 'unknown', 'docker'],
  };

  it('copies the facts from the profile and the wording from the tailored CV (RN-03, RN-06, RN-07)', () => {
    const document = buildResumeDocument({ data, profile: PROFILE, language: 'es', paper: 'a4' });

    expect(document.basics).toEqual({
      name: 'Ana García',
      headline: 'Backend Engineer',
      location: null,
      email: 'ana@example.com',
      phone: null,
      links: [{ url: 'https://github.com/ana', label: null }],
    });
    expect(document.summary).toBe('Summary.');
    // Every position, the current first; only the ones written about have bullets.
    expect(document.experience.map((p) => [p.company, p.startDate, p.endDate, p.bullets])).toEqual([
      ['Company now', '2021-03', null, ['Built the API']],
      ['Company prev', '2016-01', '2021-02', []],
      ['Company old', '2012-01', '2015-06', []],
    ]);
    // Only projects with bullets; a URL without a scheme is left out.
    expect(document.projects).toEqual([
      {
        name: 'Project p1',
        role: null,
        url: null,
        startDate: null,
        endDate: null,
        bullets: ['Wrote a CLI'],
      },
    ]);
    expect(document.skills).toEqual([{ label: null, items: ['NODE', 'DOCKER'] }]);
    expect(document.education).toEqual([
      { institution: 'UBA', title: 'Ingeniería', field: null, startDate: null, endDate: '2014-12' },
    ]);
    expect(document.languages).toEqual([{ language: 'English', level: 'C1' }]);
    expect(document).toMatchObject({ language: 'es', paper: 'a4', certifications: [] });
  });

  it('needs a name', () => {
    const profile = {
      ...PROFILE,
      personalInfo: { ...PROFILE.personalInfo, firstNames: null, lastNames: ' ' },
    };
    expect(() => buildResumeDocument({ data, profile, language: 'en', paper: 'a4' })).toThrow(
      ResumeWithoutNameError,
    );
  });
});
