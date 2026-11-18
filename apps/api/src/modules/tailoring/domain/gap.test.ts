import type { MatchResult, RequirementMatch } from '@careerly/contracts';
import { describe, expect, it } from 'vitest';
import { countGaps } from './match.js';
import {
  gapQuestions,
  invalidAnswerReason,
  isAffirmative,
  keepAnswers,
  matchWithAnswers,
} from './gap.js';

const requirement = (
  id: string,
  status: RequirementMatch['status'],
  changes: Partial<RequirementMatch> = {},
): RequirementMatch => ({
  requirementId: id,
  label: id,
  kind: 'SKILL',
  importance: 'REQUIRED',
  tool: null,
  status,
  method: 'AI',
  evidence: status === 'MISSING' ? [] : [{ kind: 'ACHIEVEMENT', id: `evidence-${id}` }],
  ...changes,
});

const match = (requirements: RequirementMatch[]): MatchResult => ({
  requirements,
  promptVersion: null,
  model: null,
  matchedAt: '2026-11-18T12:00:00.000Z',
});

describe('gapQuestions', () => {
  it('asks about every partial and missing requirement, required ones first', () => {
    const result = match([
      requirement('nice-missing', 'MISSING', { importance: 'NICE_TO_HAVE' }),
      requirement('covered', 'COVERED'),
      requirement('docker', 'PARTIAL', {
        kind: 'TOOL',
        tool: { id: 't-docker', name: 'Docker' },
        method: 'TOOLS',
        evidence: [{ kind: 'POSITION', id: 'pos-1' }],
      }),
      requirement('english', 'MISSING', { kind: 'LANGUAGE' }),
    ]);

    const questions = gapQuestions(result);
    expect(questions.map((q) => [q.requirementId, q.gap])).toEqual([
      ['docker', 'PARTIAL'],
      ['english', 'MISSING'],
      ['nice-missing', 'MISSING'],
    ]);
    expect(questions).toHaveLength(countGaps(result));
  });

  it('shows the related evidence of partial requirements only (RF-GAP-03)', () => {
    const [partial, missing] = gapQuestions(
      match([requirement('aws', 'PARTIAL'), requirement('k8s', 'MISSING')]),
    );
    expect(partial!.relatedEvidence).toEqual([{ kind: 'ACHIEVEMENT', id: 'evidence-aws' }]);
    expect(missing!.relatedEvidence).toEqual([]);
  });

  it('has nothing to ask when everything is covered', () => {
    expect(gapQuestions(match([requirement('a', 'COVERED')]))).toEqual([]);
  });
});

describe('keepAnswers', () => {
  it('keeps the answers of the requirements that are still gaps', () => {
    const asked = gapQuestions(match([requirement('a', 'MISSING'), requirement('b', 'MISSING')]));
    const answered = asked.map((q) =>
      q.requirementId === 'a'
        ? { ...q, answer: { answer: 'NOT_USED' as const }, answeredAt: '2026-11-18T13:00:00.000Z' }
        : q,
    );
    const again = gapQuestions(match([requirement('a', 'MISSING'), requirement('c', 'MISSING')]));

    expect(keepAnswers(again, answered).map((q) => [q.requirementId, q.answer])).toEqual([
      ['a', { answer: 'NOT_USED' }],
      ['c', null],
    ]);
  });
});

describe('invalidAnswerReason', () => {
  const profile = { positions: [{ id: 'pos-1' }], projects: [{ id: 'proj-1' }] } as never;

  it('accepts answers that point to the profile, and a new project', () => {
    expect(
      invalidAnswerReason({ answer: 'USED_AT_WORK', positionIds: ['pos-1'], detail: 'x' }, profile),
    ).toBeNull();
    expect(
      invalidAnswerReason(
        { answer: 'USED_ELSEWHERE', project: { id: 'proj-1' }, detail: 'x', includeInResume: true },
        profile,
      ),
    ).toBeNull();
    expect(
      invalidAnswerReason(
        {
          answer: 'USED_ELSEWHERE',
          project: { name: 'Course', kind: 'COURSE' },
          detail: 'x',
          includeInResume: false,
        },
        profile,
      ),
    ).toBeNull();
    expect(invalidAnswerReason({ answer: 'NOT_USED' }, profile)).toBeNull();
  });

  it('rejects positions or projects that do not exist, and repeated positions', () => {
    expect(
      invalidAnswerReason({ answer: 'USED_AT_WORK', positionIds: ['nope'], detail: 'x' }, profile),
    ).toMatch(/position/);
    expect(
      invalidAnswerReason(
        { answer: 'USED_AT_WORK', positionIds: ['pos-1', 'pos-1'], detail: 'x' },
        profile,
      ),
    ).toMatch(/repeat/);
    expect(
      invalidAnswerReason(
        { answer: 'USED_ELSEWHERE', project: { id: 'nope' }, detail: 'x', includeInResume: true },
        profile,
      ),
    ).toMatch(/project/);
  });
});

describe('matchWithAnswers', () => {
  const original = match([
    requirement('covered', 'COVERED'),
    requirement('aws', 'PARTIAL'),
    requirement('k8s', 'MISSING'),
  ]);
  const asked = gapQuestions(original);

  it('covers the requirements whose answers added achievements, with them as evidence', () => {
    const answered = asked.map((q) =>
      q.requirementId === 'k8s'
        ? {
            ...q,
            answer: { answer: 'USED_AT_WORK' as const, positionIds: ['p'], detail: 'x' },
            created: [{ kind: 'ACHIEVEMENT' as const, id: 'new-ach' }],
          }
        : q,
    );
    const result = matchWithAnswers(original, answered);
    expect(result.requirements.map((r) => [r.requirementId, r.status, r.evidence])).toEqual([
      ['covered', 'COVERED', [{ kind: 'ACHIEVEMENT', id: 'evidence-covered' }]],
      ['aws', 'PARTIAL', [{ kind: 'ACHIEVEMENT', id: 'evidence-aws' }]],
      ['k8s', 'COVERED', [{ kind: 'ACHIEVEMENT', id: 'new-ach' }]],
    ]);
  });

  it('puts a requirement back as the match left it when its answer no longer adds anything', () => {
    const covered = matchWithAnswers(original, [
      { ...asked[0]!, created: [{ kind: 'ACHIEVEMENT', id: 'x' }] },
    ]);
    expect(matchWithAnswers(covered, asked)).toEqual(original);
  });

  it('knows which answers are affirmative', () => {
    expect(isAffirmative({ answer: 'NOT_USED' })).toBe(false);
    expect(isAffirmative({ answer: 'SKIPPED' })).toBe(false);
    expect(isAffirmative(null)).toBe(false);
    expect(isAffirmative({ answer: 'USED_AT_WORK', positionIds: ['p'], detail: 'x' })).toBe(true);
  });
});
