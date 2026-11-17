import type { MatchResult, Profile, RequirementMatch } from '@careerly/contracts';
import { describe, expect, it } from 'vitest';
import { describeEvidence, summarizeMatch } from './match-summary';

const requirement = (
  id: string,
  status: RequirementMatch['status'],
  importance: RequirementMatch['importance'] = 'REQUIRED',
): RequirementMatch => ({
  requirementId: id,
  label: id,
  kind: 'SKILL',
  importance,
  tool: null,
  status,
  method: 'AI',
  evidence: [],
});

const match = (requirements: RequirementMatch[]): MatchResult => ({
  requirements,
  promptVersion: null,
  model: null,
  matchedAt: '2026-11-17T12:00:00.000Z',
});

describe('summarizeMatch', () => {
  it('weighs required requirements double and partial ones half', () => {
    // Earned: 2 (covered) + 1 (partial) + 0 + 1 (nice covered) = 4 of 2 + 2 + 2 + 1 = 7.
    const summary = summarizeMatch(
      match([
        requirement('a', 'COVERED'),
        requirement('b', 'PARTIAL'),
        requirement('c', 'MISSING'),
        requirement('d', 'COVERED', 'NICE_TO_HAVE'),
      ]),
    );
    expect(summary.score).toBe(57);
    expect(summary.covered.map((r) => r.label)).toEqual(['a', 'd']);
    expect(summary.partial.map((r) => r.label)).toEqual(['b']);
    expect(summary.missing.map((r) => r.label)).toEqual(['c']);
  });

  it('lists required requirements first, keeping the order otherwise', () => {
    const summary = summarizeMatch(
      match([
        requirement('nice-1', 'MISSING', 'NICE_TO_HAVE'),
        requirement('req-1', 'MISSING'),
        requirement('nice-2', 'MISSING', 'NICE_TO_HAVE'),
        requirement('req-2', 'MISSING'),
      ]),
    );
    expect(summary.missing.map((r) => r.label)).toEqual(['req-1', 'req-2', 'nice-1', 'nice-2']);
    expect(summary.score).toBe(0);
  });

  it('has no score without requirements', () => {
    expect(summarizeMatch(match([])).score).toBeNull();
    expect(summarizeMatch(match([requirement('a', 'COVERED')])).score).toBe(100);
  });
});

describe('describeEvidence', () => {
  const profile = {
    positions: [
      {
        id: 'pos-1',
        title: 'Backend Engineer',
        company: 'Acme',
        achievements: [{ id: 'ach-1', text: 'Built the payments API.' }],
      },
    ],
    projects: [
      {
        id: 'prj-1',
        name: 'feriados-api',
        role: 'Maintainer',
        achievements: [{ id: 'ach-2', text: 'Reached 1M requests a month.' }],
      },
    ],
    education: [{ id: 'edu-1', title: 'Ingeniería en Sistemas', institution: 'UTN' }],
    certifications: [{ id: 'cert-1', name: 'AWS Developer', issuer: null }],
    languages: [{ id: 'lang-1', language: 'Inglés', level: 'B2' }],
  } as unknown as Profile;

  it('says what each element is and where it comes from', () => {
    expect(describeEvidence({ kind: 'ACHIEVEMENT', id: 'ach-1' }, profile)).toEqual({
      kind: 'ACHIEVEMENT',
      text: 'Built the payments API.',
      context: 'Backend Engineer · Acme',
      href: '/profile/experience/pos-1',
    });
    expect(describeEvidence({ kind: 'ACHIEVEMENT', id: 'ach-2' }, profile)).toMatchObject({
      text: 'Reached 1M requests a month.',
      context: 'feriados-api',
      href: '/profile/projects/prj-1',
    });
    expect(describeEvidence({ kind: 'POSITION', id: 'pos-1' }, profile)).toMatchObject({
      text: 'Backend Engineer · Acme',
      context: null,
      href: '/profile/experience/pos-1',
    });
    expect(describeEvidence({ kind: 'PROJECT', id: 'prj-1' }, profile)).toMatchObject({
      text: 'feriados-api',
      context: 'Maintainer',
      href: '/profile/projects/prj-1',
    });
    expect(describeEvidence({ kind: 'EDUCATION', id: 'edu-1' }, profile)).toMatchObject({
      text: 'Ingeniería en Sistemas · UTN',
      href: '/profile/education',
    });
    expect(describeEvidence({ kind: 'CERTIFICATION', id: 'cert-1' }, profile)).toMatchObject({
      text: 'AWS Developer',
      href: '/profile/education',
    });
    expect(describeEvidence({ kind: 'LANGUAGE', id: 'lang-1' }, profile)).toMatchObject({
      text: 'Inglés',
      level: 'B2',
      href: '/profile/languages',
    });
  });

  it('returns null for elements deleted after the match', () => {
    expect(describeEvidence({ kind: 'ACHIEVEMENT', id: 'gone' }, profile)).toBeNull();
    expect(describeEvidence({ kind: 'LANGUAGE', id: 'gone' }, profile)).toBeNull();
  });
});
