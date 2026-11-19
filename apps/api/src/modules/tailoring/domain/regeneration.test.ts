import type { TailoredBullet, TailoredResumeData } from '@careerly/contracts';
import { describe, expect, it } from 'vitest';
import { mergeRegenerated, restrictToScope } from './regeneration.js';

const bullet = (
  id: string,
  edited = false,
  inclusion: TailoredBullet['inclusion'] = 'AUTO',
): TailoredBullet => ({
  id,
  text: `Text ${id}`,
  sourceIds: ['a'],
  score: null,
  editedByUser: edited,
  inclusion,
});

const data = (
  summary: string,
  experiences: Record<string, TailoredBullet[]>,
  dropped: TailoredResumeData['guard']['dropped'] = [],
): TailoredResumeData => ({
  summary: { text: summary, sourceIds: [] },
  experiences: Object.entries(experiences).map(([sourceId, bullets]) => ({
    kind: 'POSITION',
    sourceId,
    bullets,
  })),
  toolIds: [summary],
  guard: { rewritten: 1, dropped },
  fit: null,
});

const drop = (experienceId: string | null) => ({
  kind: experienceId ? ('BULLET' as const) : ('SUMMARY' as const),
  experienceId,
  text: `Dropped ${experienceId ?? 'summary'}`,
  reasons: ['NO_SOURCE' as const],
});

// The user edited b2 (in w1) and b4 (in w2), pinned b5 and excluded b6 (in w1).
const CURRENT = data(
  'Old summary',
  {
    w1: [
      bullet('b1'),
      bullet('b2', true),
      bullet('b5', false, 'INCLUDED'),
      bullet('b6', false, 'EXCLUDED'),
    ],
    w2: [bullet('b3'), bullet('b4', true)],
  },
  [drop('w1'), drop('w2'), drop(null)],
);
const FRESH = data('New summary', { w1: [bullet('n1'), bullet('n2')], w2: [bullet('n3')] }, [
  drop('w1'),
]);

const ids = (result: TailoredResumeData) =>
  Object.fromEntries(result.experiences.map((e) => [e.sourceId, e.bullets.map((b) => b.id)]));

describe('regeneration (RF-TAIL-13)', () => {
  it('rewrites one experience, keeping its edited bullets and everything else as it was', () => {
    const scope = { kind: 'EXPERIENCE' as const, experienceId: 'w1' };
    const result = mergeRegenerated(CURRENT, restrictToScope(FRESH, scope), scope);

    expect(ids(result)).toEqual({ w1: ['b2', 'b5', 'n1', 'n2'], w2: ['b3', 'b4'] });
    // The edited bullet keeps the user's choices.
    expect(result.experiences[0]!.bullets[0]).toEqual(bullet('b2', true));
    expect(result.summary!.text).toBe('Old summary');
    expect(result.toolIds).toEqual(['Old summary']);
    expect(result.guard.dropped.map((d) => d.experienceId)).toEqual(['w2', null, 'w1']);
    expect(result.guard.rewritten).toBe(2);
    expect(result.fit).toBeNull();
  });

  it('rewrites only the summary', () => {
    const scope = { kind: 'SUMMARY' as const };
    const result = mergeRegenerated(CURRENT, restrictToScope(FRESH, scope), scope);

    expect(result.summary!.text).toBe('New summary');
    expect(ids(result)).toEqual({ w1: ['b1', 'b2', 'b5', 'b6'], w2: ['b3', 'b4'] });
    // The summary's old guard entry goes; the bullets' stay.
    expect(result.guard.dropped.map((d) => d.experienceId)).toEqual(['w1', 'w2']);
  });

  it('rewrites the whole CV without losing any bullet the user edited or pinned', () => {
    const scope = { kind: 'ALL' as const };
    const result = mergeRegenerated(
      CURRENT,
      restrictToScope(data('New summary', { w1: [bullet('n1')] }), scope),
      scope,
    );

    expect(ids(result)).toEqual({ w1: ['b2', 'b5', 'n1'], w2: ['b4'] });
    expect(result.summary!.text).toBe('New summary');
    expect(result.toolIds).toEqual(['New summary']);
    expect(result.guard).toEqual({ rewritten: 1, dropped: [] });
  });

  it('keeps only what the scope asked for from the AI’s answer', () => {
    const restricted = restrictToScope(FRESH, { kind: 'EXPERIENCE', experienceId: 'w2' });
    expect(restricted.summary).toBeNull();
    expect(ids(restricted)).toEqual({ w2: ['n3'] });
    expect(restricted.guard.dropped).toEqual([]);
    expect(ids(restrictToScope(FRESH, { kind: 'SUMMARY' }))).toEqual({});
  });
});
