import type { MatchResult, RequirementMatch } from '@careerly/contracts';
import { describe, expect, it } from 'vitest';
import { countGaps } from './match.js';
import { gapQuestions } from './gap.js';

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
