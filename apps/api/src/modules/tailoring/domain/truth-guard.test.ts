import type { Profile, TailoredResumeData } from '@careerly/contracts';
import { describe, expect, it } from 'vitest';
import {
  applyRewrites,
  findTruthIssues,
  numberMentions,
  type ToolTerm,
  type TruthIssue,
} from './truth-guard.js';

const TODAY = '2026-11';

const provenance = {
  origin: 'MANUAL',
  originSessionId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as const;

const VOCABULARY: ToolTerm[] = [
  ['node', 'Node.js', 'Node', 'NodeJS'],
  ['pg', 'PostgreSQL', 'Postgres'],
  ['k8s', 'Kubernetes', 'K8s'],
  ['docker', 'Docker'],
  ['go', 'Go', 'Golang'],
  ['rest', 'REST'],
  ['react', 'React'],
  ['gcp', 'Google Cloud Platform', 'GCP'],
  ['cicd', 'CI/CD'],
  ['csharp', 'C#'],
].flatMap(([toolId, ...terms]) => terms.map((term) => ({ toolId: toolId!, term })));

const tool = (id: string, name: string) => ({ id, name });

const PROFILE = {
  personalInfo: {
    firstNames: 'Ana',
    lastNames: 'García',
    headline: 'Backend Engineer',
    location: null,
    email: null,
    phone: null,
    summary: 'Backend engineer focused on payments.',
    links: [],
    updatedAt: null,
  },
  positions: [
    {
      id: 'now',
      company: 'Pagos',
      title: 'Backend Developer',
      location: null,
      workMode: null,
      startDate: '2021-04',
      endDate: null,
      context: 'Fintech with 2M users.',
      tools: [tool('docker', 'Docker')],
      achievements: [
        {
          id: 'a1',
          text: 'Designed the REST API for payments that processes 50.000 transactions a day.',
          metrics: '-40% p95 latency',
          tools: [tool('node', 'Node.js'), tool('pg', 'PostgreSQL')],
          ...provenance,
        },
        {
          id: 'a2',
          text: 'Mentored tres junior developers.',
          metrics: null,
          tools: [],
          ...provenance,
        },
      ],
      ...provenance,
    },
    {
      id: 'prev',
      company: 'Shop',
      title: 'Developer',
      location: null,
      workMode: null,
      startDate: '2017-01',
      endDate: '2021-03',
      context: null,
      tools: [],
      achievements: [
        {
          id: 'a3',
          text: 'Moved the deploys to Kubernetes on GCP.',
          metrics: null,
          tools: [],
          ...provenance,
        },
      ],
      ...provenance,
    },
  ],
  projects: [],
  education: [],
  certifications: [],
  languages: [],
} as unknown as Profile;

function cv(
  bullets: { id: string; text: string; sourceIds: string[]; edited?: boolean }[],
  summary: string | null = null,
  experienceId = 'now',
): TailoredResumeData {
  return {
    summary: summary === null ? null : { text: summary, sourceIds: [] },
    experiences: [
      {
        kind: 'POSITION',
        sourceId: experienceId,
        bullets: bullets.map(({ edited, ...b }) => ({
          ...b,
          score: null,
          editedByUser: edited ?? false,
        })),
      },
    ],
    toolIds: [],
    guard: { rewritten: 0, dropped: [] },
  };
}

const issuesOf = (data: TailoredResumeData) =>
  findTruthIssues(data, PROFILE, VOCABULARY, TODAY).map((i) => ({
    text: i.text,
    reasons: i.reasons,
    tools: i.tools,
    numbers: i.numbers,
  }));

describe('truth guard: tools (RN-02)', () => {
  it('accepts tools tagged on the experience or its cited achievements, or named in the sources', () => {
    const data = cv([
      {
        id: 'b1',
        text: 'Built a Node.js and Postgres REST API, shipped with Docker',
        sourceIds: ['a1'],
      },
    ]);
    expect(issuesOf(data)).toEqual([]);
  });

  it('rejects a tool that is not in the sources, even if the job description asks for it', () => {
    const data = cv([
      { id: 'b1', text: 'Designed the payments API on Kubernetes with Go', sourceIds: ['a1'] },
      // Kubernetes is in the profile, but in another position: its sources do not show it.
      { id: 'b2', text: 'Mentored junior developers using Kubernetes', sourceIds: ['a2'] },
    ]);
    expect(issuesOf(data)).toEqual([
      {
        text: 'Designed the payments API on Kubernetes with Go',
        reasons: ['TOOL_NOT_IN_SOURCES'],
        tools: ['Kubernetes', 'Go'],
        numbers: [],
      },
      {
        text: 'Mentored junior developers using Kubernetes',
        reasons: ['TOOL_NOT_IN_SOURCES'],
        tools: ['Kubernetes'],
        numbers: [],
      },
    ]);
  });

  it('finds names of several words and with symbols, and ambiguous words only as written', () => {
    const data = cv([
      {
        id: 'b1',
        text: 'Set up CI/CD on Google Cloud Platform for C# services',
        sourceIds: ['a1'],
      },
      // "go" and "rest" in lower case are words, not tools.
      {
        id: 'b2',
        text: 'Helped the team go live and rest assured of the uptime',
        sourceIds: ['a1'],
      },
    ]);
    expect(issuesOf(data)).toEqual([
      expect.objectContaining({ tools: ['CI/CD', 'Google Cloud Platform', 'C#'] }),
    ]);
  });

  it('lets the summary use any tool of the profile', () => {
    expect(issuesOf(cv([], 'Backend engineer with Node.js, Kubernetes and GCP'))).toEqual([]);
    expect(issuesOf(cv([], 'Backend engineer with React'))).toEqual([
      expect.objectContaining({ reasons: ['TOOL_NOT_IN_SOURCES'], tools: ['React'] }),
    ]);
  });

  it('does not check bullets edited by the user (RN-05)', () => {
    const data = cv([{ id: 'b1', text: 'Used React', sourceIds: ['a1'], edited: true }]);
    expect(issuesOf(data)).toEqual([]);
  });
});

describe('truth guard: numbers', () => {
  it('accepts numbers of the sources however they are written', () => {
    const data = cv([
      {
        id: 'b1',
        text: 'Processed 50k transactions a day and cut p95 latency by 40%',
        sourceIds: ['a1'],
      },
      {
        id: 'b2',
        text: 'Procesé 50,000 transacciones diarias para 2M de usuarios',
        sourceIds: ['a1'],
      },
      { id: 'b3', text: 'Mentored 3 junior developers', sourceIds: ['a2'] },
      // Years the dates allow: since 2021-04, up to 6.
      { id: 'b4', text: 'Led payments for 5+ years since 2021', sourceIds: ['a1'] },
    ]);
    expect(issuesOf(data)).toEqual([]);
  });

  it('rejects invented metrics and amounts', () => {
    const data = cv([
      {
        id: 'b1',
        text: 'Processed 80k transactions a day, cutting latency by 60%',
        sourceIds: ['a1'],
      },
      { id: 'b2', text: 'Mentored a team of 5 developers', sourceIds: ['a2'] },
      // More years than the dates allow.
      { id: 'b3', text: 'Over 10 years building payments', sourceIds: ['a1'] },
    ]);
    expect(issuesOf(data)).toEqual([
      expect.objectContaining({ reasons: ['NUMBER_NOT_IN_SOURCES'], numbers: ['80k', '60%'] }),
      expect.objectContaining({ numbers: ['5'] }),
      expect.objectContaining({ numbers: ['10'] }),
    ]);
  });

  it('reads separators, units and names with digits', () => {
    const values = (text: string) => numberMentions(text).map((n) => n.value);
    expect(values('50.000 and 1,250,000 and 1,5M and 2.5k and 40% and 3 años')).toEqual([
      50000, 1250000, 1500000, 2500, 40, 3,
    ]);
    // Digits inside names are not numbers.
    expect(values('S3, EC2, ES6 and k8s')).toEqual([]);
    expect(numberMentions('8+ years').map((n) => n.years)).toEqual([true]);
  });
});

describe('truth guard: rewrites', () => {
  const data = cv(
    [
      { id: 'b1', text: 'Built the payments API on Kubernetes', sourceIds: ['a1'] },
      { id: 'b2', text: 'Mentored 5 developers', sourceIds: ['a2'] },
      { id: 'b3', text: 'Ran Go services', sourceIds: ['a1'] },
      { id: 'b4', text: 'Shipped with React', sourceIds: ['a1'] },
      { id: 'b5', text: 'Kept as it was', sourceIds: ['a1'] },
    ],
    'Engineer with 20 years of React',
  );
  const issues = findTruthIssues(data, PROFILE, VOCABULARY, TODAY);
  const target = (bulletId: string) =>
    issues.find((i) => i.target.kind === 'BULLET' && i.target.bulletId === bulletId)!.target;

  it('uses rewrites that pass and drops, with their reasons, the ones that do not', () => {
    expect(issues).toHaveLength(5);
    const result = applyRewrites(
      data,
      issues,
      [
        // Fixed.
        { target: target('b1'), text: 'Built the payments API with Node.js', sourceIds: ['a1'] },
        // Still invented.
        { target: target('b2'), text: 'Mentored 4 developers', sourceIds: ['a2'] },
        // Cites an achievement of another position: no source left.
        { target: target('b3'), text: 'Ran the deploys', sourceIds: ['a3'] },
        // Given up.
        { target: target('b4'), text: '', sourceIds: [] },
        // b5 had no issue; the summary is fixed.
        {
          target: { kind: 'SUMMARY' },
          text: 'Backend engineer focused on payments',
          sourceIds: ['now'],
        },
      ],
      PROFILE,
      VOCABULARY,
      TODAY,
    );

    expect(result.experiences[0]!.bullets.map((b) => [b.id, b.text, b.sourceIds])).toEqual([
      ['b1', 'Built the payments API with Node.js', ['a1']],
      ['b5', 'Kept as it was', ['a1']],
    ]);
    expect(result.summary).toEqual({
      text: 'Backend engineer focused on payments',
      sourceIds: ['now'],
    });
    expect(result.guard).toEqual({
      rewritten: 2,
      dropped: [
        {
          kind: 'BULLET',
          experienceId: 'now',
          text: 'Mentored 4 developers',
          reasons: ['NUMBER_NOT_IN_SOURCES'],
        },
        { kind: 'BULLET', experienceId: 'now', text: 'Ran the deploys', reasons: ['NO_SOURCE'] },
        {
          kind: 'BULLET',
          experienceId: 'now',
          text: 'Shipped with React',
          reasons: ['TOOL_NOT_IN_SOURCES'],
        },
      ],
    });
  });

  it('drops what the AI did not answer, the summary included, and empties experiences left bare', () => {
    const only: TruthIssue[] = findTruthIssues(
      cv([{ id: 'b1', text: 'Ran Go services', sourceIds: ['a1'] }], 'Expert in React'),
      PROFILE,
      VOCABULARY,
      TODAY,
    );
    const result = applyRewrites(
      cv([{ id: 'b1', text: 'Ran Go services', sourceIds: ['a1'] }], 'Expert in React'),
      only,
      [],
      PROFILE,
      VOCABULARY,
      TODAY,
    );
    expect(result.summary).toBeNull();
    expect(result.experiences).toEqual([]);
    expect(result.guard.dropped.map((d) => [d.kind, d.text, d.reasons])).toEqual([
      ['BULLET', 'Ran Go services', ['TOOL_NOT_IN_SOURCES']],
      ['SUMMARY', 'Expert in React', ['TOOL_NOT_IN_SOURCES']],
    ]);
  });
});
