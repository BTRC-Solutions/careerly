import { describe, expect, it } from 'vitest';
import { MAX_REQUIREMENTS, normalizeAnalysis, type RawJobAnalysis } from './job-analysis.js';

const RAW: RawJobAnalysis = {
  language: ' EN ',
  roleCategory: 'backend',
  seniority: 'senior',
  workMode: 'remote',
  country: 'ar',
  yearsOfExperience: 5,
  keywords: ['APIs', ' apis ', 'Payments'],
  requirements: [
    { label: '  Node.js ', kind: 'TOOL', importance: 'NICE_TO_HAVE' },
    { label: 'node.js', kind: 'TOOL', importance: 'REQUIRED' },
    { label: 'English', kind: 'LANGUAGE', importance: 'REQUIRED' },
    { label: '   ', kind: 'SKILL', importance: 'REQUIRED' },
  ],
};

describe('normalizeAnalysis', () => {
  it('cleans codes, texts and duplicates', () => {
    expect(normalizeAnalysis(RAW)).toEqual({
      language: 'en',
      roleCategory: 'backend',
      seniority: 'senior',
      workMode: 'remote',
      country: 'AR',
      yearsOfExperience: 5,
      keywords: ['APIs', 'Payments'],
      requirements: [
        // Listed as nice-to-have and required: the first one stays, and it is required.
        { label: 'Node.js', kind: 'TOOL', importance: 'REQUIRED' },
        { label: 'English', kind: 'LANGUAGE', importance: 'REQUIRED' },
      ],
    });
  });

  it('drops values that do not fit instead of guessing', () => {
    const normalized = normalizeAnalysis({
      ...RAW,
      language: 'english',
      country: 'Argentina',
      yearsOfExperience: 99,
    });
    expect(normalized).toMatchObject({ language: 'und', country: null, yearsOfExperience: null });
  });

  it('caps the number of requirements', () => {
    const many = Array.from({ length: 100 }, (_, index) => ({
      label: `Skill ${index}`,
      kind: 'SKILL' as const,
      importance: 'REQUIRED' as const,
    }));
    expect(normalizeAnalysis({ ...RAW, requirements: many }).requirements).toHaveLength(
      MAX_REQUIREMENTS,
    );
  });
});
