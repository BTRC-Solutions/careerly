import type { JobRequirement } from '@careerly/contracts';
import { describe, expect, it } from 'vitest';
import {
  countGaps,
  isToolMatchable,
  type MatchableProfile,
  matchTool,
  semanticMatches,
} from './match.js';

const tool = (id: string) => ({ id, name: id });

const profile: MatchableProfile = {
  positions: [
    {
      id: 'pos-1',
      tools: [tool('node'), tool('docker')],
      achievements: [
        { id: 'ach-1', tools: [tool('node'), tool('postgres')] },
        { id: 'ach-2', tools: [] },
      ],
    },
    { id: 'pos-2', tools: [tool('docker')], achievements: [] },
  ],
  projects: [
    { id: 'prj-1', tools: [tool('react')], achievements: [{ id: 'ach-3', tools: [tool('node')] }] },
  ],
  education: [{ id: 'edu-1' }],
  certifications: [{ id: 'cert-1' }],
  languages: [{ id: 'lang-1' }],
};

const requirement = (overrides: Partial<JobRequirement> = {}): JobRequirement => ({
  id: 'req-1',
  label: 'Node.js',
  kind: 'TOOL',
  importance: 'REQUIRED',
  tool: tool('node'),
  ...overrides,
});

const toolMatch = (toolId: string) => {
  const req = requirement({ tool: tool(toolId), label: toolId });
  if (!isToolMatchable(req)) throw new Error('not a catalog tool');
  return matchTool(req, profile);
};

describe('matchTool', () => {
  it('is covered by every achievement that uses the tool, in positions and projects', () => {
    expect(toolMatch('node')).toMatchObject({
      status: 'COVERED',
      method: 'TOOLS',
      evidence: [
        { kind: 'ACHIEVEMENT', id: 'ach-1' },
        { kind: 'ACHIEVEMENT', id: 'ach-3' },
      ],
    });
  });

  it('is partial when positions or projects list the tool but no achievement uses it', () => {
    expect(toolMatch('docker')).toMatchObject({
      status: 'PARTIAL',
      evidence: [
        { kind: 'POSITION', id: 'pos-1' },
        { kind: 'POSITION', id: 'pos-2' },
      ],
    });
    expect(toolMatch('react')).toMatchObject({
      status: 'PARTIAL',
      evidence: [{ kind: 'PROJECT', id: 'prj-1' }],
    });
  });

  it('is missing when the profile does not have the tool', () => {
    expect(toolMatch('kubernetes')).toMatchObject({ status: 'MISSING', evidence: [] });
  });

  it('keeps the requirement data', () => {
    expect(toolMatch('postgres')).toEqual({
      requirementId: 'req-1',
      label: 'postgres',
      kind: 'TOOL',
      importance: 'REQUIRED',
      tool: tool('postgres'),
      status: 'COVERED',
      method: 'TOOLS',
      evidence: [{ kind: 'ACHIEVEMENT', id: 'ach-1' }],
    });
  });

  it('only takes tools resolved to the catalog', () => {
    expect(isToolMatchable(requirement())).toBe(true);
    expect(isToolMatchable(requirement({ tool: null }))).toBe(false);
    expect(isToolMatchable(requirement({ kind: 'SKILL', tool: null }))).toBe(false);
  });
});

describe('semanticMatches', () => {
  const skill = requirement({ id: 'req-skill', label: 'Leading teams', kind: 'SKILL', tool: null });
  const english = requirement({ id: 'req-en', label: 'English', kind: 'LANGUAGE', tool: null });

  it('keeps the evidence that exists in the profile', () => {
    const [match] = semanticMatches(
      [skill],
      [
        {
          requirementId: 'req-skill',
          status: 'COVERED',
          evidence: [
            { kind: 'ACHIEVEMENT', id: 'ach-2' },
            { kind: 'ACHIEVEMENT', id: 'invented' },
            { kind: 'POSITION', id: 'ach-2' },
            { kind: 'ACHIEVEMENT', id: 'ach-2' },
            { kind: 'POSITION', id: 'pos-1' },
          ],
        },
      ],
      profile,
    );
    expect(match).toMatchObject({
      status: 'COVERED',
      method: 'AI',
      evidence: [
        { kind: 'ACHIEVEMENT', id: 'ach-2' },
        { kind: 'POSITION', id: 'pos-1' },
      ],
    });
  });

  it('accepts every kind of profile element as evidence', () => {
    const evidence = [
      { kind: 'PROJECT', id: 'prj-1' },
      { kind: 'ACHIEVEMENT', id: 'ach-3' },
      { kind: 'EDUCATION', id: 'edu-1' },
      { kind: 'CERTIFICATION', id: 'cert-1' },
      { kind: 'LANGUAGE', id: 'lang-1' },
    ] as const;
    const [match] = semanticMatches(
      [skill],
      [{ requirementId: 'req-skill', status: 'PARTIAL', evidence: [...evidence] }],
      profile,
    );
    expect(match).toMatchObject({ status: 'PARTIAL', evidence });
  });

  it('makes a requirement missing when no evidence is left', () => {
    const [match] = semanticMatches(
      [skill],
      [
        {
          requirementId: 'req-skill',
          status: 'COVERED',
          evidence: [{ kind: 'EDUCATION', id: 'x' }],
        },
      ],
      profile,
    );
    expect(match).toMatchObject({ status: 'MISSING', evidence: [] });
  });

  it('drops the evidence of a missing requirement', () => {
    const [match] = semanticMatches(
      [skill],
      [
        {
          requirementId: 'req-skill',
          status: 'MISSING',
          evidence: [{ kind: 'ACHIEVEMENT', id: 'ach-1' }],
        },
      ],
      profile,
    );
    expect(match).toMatchObject({ status: 'MISSING', evidence: [] });
  });

  it('answers every requirement, in order, ignoring unknown and repeated answers', () => {
    const matches = semanticMatches(
      [skill, english],
      [
        {
          requirementId: 'unknown',
          status: 'COVERED',
          evidence: [{ kind: 'LANGUAGE', id: 'lang-1' }],
        },
        {
          requirementId: 'req-en',
          status: 'COVERED',
          evidence: [{ kind: 'LANGUAGE', id: 'lang-1' }],
        },
        { requirementId: 'req-en', status: 'MISSING', evidence: [] },
      ],
      profile,
    );
    expect(matches.map((m) => [m.requirementId, m.status])).toEqual([
      ['req-skill', 'MISSING'],
      ['req-en', 'COVERED'],
    ]);
  });
});

describe('countGaps', () => {
  it('counts partial and missing requirements', () => {
    expect(
      countGaps({
        requirements: [
          { status: 'COVERED' },
          { status: 'PARTIAL' },
          { status: 'MISSING' },
          { status: 'COVERED' },
        ],
      }),
    ).toBe(2);
    expect(countGaps({ requirements: [] })).toBe(0);
  });
});
