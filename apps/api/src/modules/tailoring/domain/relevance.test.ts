import type { MatchResult, Profile, TailoredResumeData } from '@careerly/contracts';
import { describe, expect, it } from 'vitest';
import { EVIDENCE_FLOOR, relevanceCandidates, relevanceScores, scoreBullets } from './relevance.js';

const provenance = {
  origin: 'MANUAL',
  originSessionId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as const;

const achievement = (id: string) => ({ id, text: id, metrics: null, tools: [], ...provenance });

const profile = {
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
  positions: [
    {
      id: 'pos-1',
      company: 'Acme',
      title: 'Engineer',
      location: null,
      workMode: null,
      startDate: '2020-01',
      endDate: null,
      context: null,
      tools: [],
      achievements: [achievement('a1'), achievement('a2')],
      ...provenance,
    },
  ],
  projects: [
    {
      id: 'p1',
      name: 'Side project',
      kind: 'PERSONAL',
      role: null,
      url: null,
      startDate: null,
      endDate: null,
      description: null,
      tools: [],
      achievements: [achievement('a3')],
      ...provenance,
    },
  ],
  education: [],
  certifications: [],
  languages: [],
} satisfies Profile;

const match = (evidence: MatchResult['requirements'][number]['evidence'], missing = false) =>
  ({
    requirements: [
      {
        requirementId: 'r1',
        label: 'Kafka',
        kind: 'TOOL',
        importance: 'REQUIRED',
        tool: null,
        status: missing ? 'MISSING' : 'COVERED',
        method: 'TOOLS',
        evidence,
      },
    ],
    promptVersion: null,
    model: null,
    matchedAt: '2026-11-18T12:00:00.000Z',
  }) satisfies MatchResult;

describe('relevanceCandidates', () => {
  it('lists every achievement and project, in profile order', () => {
    expect(relevanceCandidates(profile)).toEqual([
      { kind: 'ACHIEVEMENT', id: 'a1' },
      { kind: 'ACHIEVEMENT', id: 'a2' },
      { kind: 'PROJECT', id: 'p1' },
      { kind: 'ACHIEVEMENT', id: 'a3' },
    ]);
  });
});

describe('relevanceScores', () => {
  const candidates = relevanceCandidates(profile);

  it('keeps one score per candidate, clamped and rounded, and drops unknown ids', () => {
    const scores = relevanceScores(
      candidates,
      [
        { kind: 'ACHIEVEMENT', id: 'a1', score: 0.876 },
        { kind: 'ACHIEVEMENT', id: 'a2', score: 7 },
        { kind: 'PROJECT', id: 'p1', score: -1 },
        { kind: 'ACHIEVEMENT', id: 'invented', score: 1 },
        { kind: 'PROJECT', id: 'a3', score: 1 }, // right id, wrong kind
      ],
      null,
    );
    expect(scores).toEqual([
      { kind: 'ACHIEVEMENT', id: 'a1', score: 0.88 },
      { kind: 'ACHIEVEMENT', id: 'a2', score: 1 },
      { kind: 'PROJECT', id: 'p1', score: 0 },
      // Not answered.
      { kind: 'ACHIEVEMENT', id: 'a3', score: 0 },
    ]);
  });

  it('raises the evidence of covered requirements to the floor, not missing ones', () => {
    const answers = [{ kind: 'ACHIEVEMENT' as const, id: 'a1', score: 0.1 }];
    const evidence = [{ kind: 'ACHIEVEMENT' as const, id: 'a1' }];
    expect(relevanceScores(candidates, answers, match(evidence))[0]!.score).toBe(EVIDENCE_FLOOR);
    expect(relevanceScores(candidates, answers, match(evidence, true))[0]!.score).toBe(0.1);
    // A higher score is kept.
    expect(
      relevanceScores(candidates, [{ ...answers[0]!, score: 0.9 }], match(evidence))[0]!.score,
    ).toBe(0.9);
  });
});

describe('scoreBullets', () => {
  const bullet = (id: string, sourceIds: string[]) => ({
    id,
    text: id,
    sourceIds,
    score: null,
    editedByUser: false,
    inclusion: 'AUTO' as const,
  });
  const data: TailoredResumeData = {
    summary: null,
    experiences: [
      {
        kind: 'POSITION',
        sourceId: 'p1',
        bullets: [bullet('b1', ['a1', 'a2']), bullet('b2', ['a3'])],
      },
      { kind: 'PROJECT', sourceId: 'pr1', bullets: [bullet('b3', ['pr1'])] },
    ],
    toolIds: [],
    guard: { rewritten: 0, dropped: [] },
    fit: null,
  };

  it('gives each bullet the best score of its sources, and leaves unscored ones as they are', () => {
    const scored = scoreBullets(data, [
      { kind: 'ACHIEVEMENT', id: 'a1', score: 0.2 },
      { kind: 'ACHIEVEMENT', id: 'a2', score: 0.7 },
      { kind: 'PROJECT', id: 'pr1', score: 0.4 },
    ]);
    expect(scored.experiences.flatMap((e) => e.bullets.map((b) => [b.id, b.score]))).toEqual([
      ['b1', 0.7],
      ['b2', null],
      ['b3', 0.4],
    ]);
  });
});
