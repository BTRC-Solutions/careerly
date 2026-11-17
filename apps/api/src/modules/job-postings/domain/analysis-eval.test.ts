import type { JobAnalysis, JobRequirement } from '@careerly/contracts';
import { describe, expect, it } from 'vitest';
import { scoreAnalysis, totalScore } from './analysis-eval.js';

const requirement = (
  label: string,
  importance: JobRequirement['importance'] = 'REQUIRED',
  tool: string | null = null,
): JobRequirement => ({
  id: label,
  label,
  kind: tool ? 'TOOL' : 'SKILL',
  importance,
  tool: tool ? { id: tool, name: tool } : null,
});

const analysis = (requirements: JobRequirement[]): JobAnalysis => ({
  jobPostingId: 'p1',
  language: 'en',
  roleCategory: 'backend',
  seniority: 'senior',
  workMode: 'remote',
  country: null,
  yearsOfExperience: 5,
  keywords: [],
  requirements,
  promptVersion: 'jd-analysis.v1',
  model: 'test',
  analyzedAt: '2026-11-17T12:00:00.000Z',
  editedAt: null,
});

describe('scoreAnalysis', () => {
  it('matches wordings loosely, through the catalog tool and alternatives', () => {
    const score = scoreAnalysis(
      analysis([
        requirement('Postgres', 'REQUIRED', 'PostgreSQL'),
        requirement('Designing REST APIs'),
        requirement('Inglés avanzado', 'NICE_TO_HAVE'),
        requirement('node.js'),
      ]),
      {
        required: ['PostgreSQL', 'REST API', 'Node.js'],
        niceToHave: [['English', 'Inglés']],
      },
    );
    expect(score.matched.map((m) => [m.expected, m.extracted])).toEqual([
      ['PostgreSQL', 'Postgres'],
      ['REST API', 'Designing REST APIs'],
      ['Node.js', 'node.js'],
      ['English', 'Inglés avanzado'],
    ]);
    expect(score.missed).toEqual([]);
    expect(score.unexpected).toEqual([]);
  });

  it('reports misses, extras, acceptable extras, importance and facts', () => {
    const score = scoreAnalysis(
      analysis([
        requirement('Go', 'NICE_TO_HAVE', 'Go'),
        requirement('Teamwork'),
        requirement('Communication skills'),
        requirement('Blockchain'),
      ]),
      {
        required: ['Go', 'Kafka'],
        niceToHave: [],
        acceptable: ['Teamwork', 'Communication'],
        facts: { seniority: 'senior', workMode: 'hybrid', yearsOfExperience: 5 },
      },
    );
    expect(score.matched).toEqual([
      {
        expected: 'Go',
        extracted: 'Go',
        expectedImportance: 'REQUIRED',
        extractedImportance: 'NICE_TO_HAVE',
      },
    ]);
    expect(score.missed).toEqual([{ expected: 'Kafka', importance: 'REQUIRED' }]);
    expect(score.accepted).toEqual(['Teamwork', 'Communication skills']);
    expect(score.unexpected).toEqual(['Blockchain']);
    expect(score.facts.map((fact) => [fact.field, fact.ok])).toEqual([
      ['seniority', true],
      ['workMode', false],
      ['yearsOfExperience', true],
    ]);

    expect(totalScore([score])).toEqual({
      cases: 1,
      precision: 3 / 4,
      recall: 1 / 2,
      importance: 0,
      facts: 2 / 3,
    });
  });

  it('uses each extracted requirement once', () => {
    const score = scoreAnalysis(analysis([requirement('AWS', 'REQUIRED', 'AWS')]), {
      required: ['AWS', ['AWS', 'Amazon Web Services']],
      niceToHave: [],
    });
    expect(score.matched).toHaveLength(1);
    expect(score.missed).toHaveLength(1);
  });

  it('does not match a word inside another one', () => {
    const score = scoreAnalysis(analysis([requirement('JavaScript', 'REQUIRED', 'JavaScript')]), {
      required: ['Java'],
      niceToHave: [],
    });
    expect(score.missed).toHaveLength(1);
    expect(score.unexpected).toEqual(['JavaScript']);
  });

  it('counts nothing as perfect', () => {
    expect(totalScore([])).toEqual({ cases: 0, precision: 1, recall: 1, importance: 1, facts: 1 });
  });
});
