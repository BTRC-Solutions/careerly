import { describe, expect, it } from 'vitest';
import {
  type BulletCandidate,
  type FitCandidates,
  type FitSelection,
  fitToPages,
  type Measure,
  type PositionCandidate,
} from './page-fitter.js';

/*
 * Fake measure: a page holds 10 lines; a position header takes 2, a project header 1 and each bullet 1.
 * It also records every selection it was asked to measure.
 */
function fakeMeasure(linesPerPage = 10): Measure & { calls: FitSelection[] } {
  const calls: FitSelection[] = [];
  const measure = async (selection: FitSelection) => {
    calls.push(selection);
    const lines =
      selection.positions.reduce((sum, position) => sum + 2 + position.bulletIds.length, 0) +
      selection.projects.reduce((sum, project) => sum + 1 + project.bulletIds.length, 0);
    return Math.max(1, Math.ceil(lines / linesPerPage));
  };
  return Object.assign(measure, { calls });
}

/** Bullets `<prefix>1..n` with the given scores. */
function bullets(prefix: string, ...scores: number[]): BulletCandidate[] {
  return scores.map((score, index) => ({ id: `${prefix}${index + 1}`, score }));
}

function position(
  id: string,
  startDate: string,
  endDate: string | null,
  ...scores: number[]
): PositionCandidate {
  return { id, startDate, endDate, bullets: bullets(`${id}-`, ...scores) };
}

const TODAY = '2026-11';

describe('fitToPages', () => {
  it('applies the initial rules per section and orders positions and bullets (RN-06, RN-07)', async () => {
    const candidates: FitCandidates = {
      positions: [
        position('old', '2008-01', '2012-12', 0.9, 0.8),
        position('current', '2022-03', null, 0.1, 0.9, 0.5, 0.7, 0.3, 0.2, 0.8),
        position('recent', '2019-01', '2022-02', 0.4, 0.6, 0.2, 0.9),
      ],
      projects: [
        { id: 'relevant', relevant: true, bullets: bullets('relevant-', 0.5, 0.9, 0.1, 0.7) },
        { id: 'other', relevant: false, bullets: bullets('other-', 0.9) },
      ],
    };

    // Plenty of room, and filling disabled by a single measurement: only the initial rules apply.
    const result = await fitToPages(candidates, fakeMeasure(100), {
      pageBudget: 2,
      today: TODAY,
      rules: { maxMeasurements: 1 },
    });

    expect(result.selection).toEqual({
      positions: [
        {
          id: 'current',
          bulletIds: ['current-2', 'current-7', 'current-4', 'current-3', 'current-5'],
        },
        { id: 'recent', bulletIds: ['recent-4', 'recent-2', 'recent-1'] },
        { id: 'old', bulletIds: [] },
      ],
      projects: [{ id: 'relevant', bulletIds: ['relevant-2', 'relevant-4', 'relevant-1'] }],
    });
    expect(result).toMatchObject({ pageCount: 1, fits: true });
    expect(result.log).toEqual(
      expect.arrayContaining([
        {
          owner: { type: 'position', id: 'current' },
          bulletId: 'current-6',
          action: 'LEFT_OUT',
          reason: 'SECTION_LIMIT',
        },
        {
          owner: { type: 'position', id: 'old' },
          bulletId: 'old-1',
          action: 'LEFT_OUT',
          reason: 'OLD_POSITION',
        },
        {
          owner: { type: 'project', id: 'other' },
          bulletId: null,
          action: 'LEFT_OUT',
          reason: 'NOT_RELEVANT',
        },
      ]),
    );
  });

  it('keeps everything when the CV fits exactly', async () => {
    // 2 + 5 bullets + 2 + 1 bullet = 10 lines: exactly one page; nothing left out to add.
    const candidates: FitCandidates = {
      positions: [
        position('current', '2022-01', null, 0.9, 0.8, 0.7, 0.6, 0.5),
        position('recent', '2020-01', '2021-12', 0.4),
      ],
      projects: [],
    };
    const measure = fakeMeasure();

    const result = await fitToPages(candidates, measure, { pageBudget: 1, today: TODAY });

    expect(result).toMatchObject({ pageCount: 1, fits: true, log: [] });
    expect(result.selection.positions.map((p) => p.bulletIds.length)).toEqual([5, 1]);
    expect(measure.calls).toHaveLength(1);
  });

  it('removes the lowest-scored bullets until the CV fits', async () => {
    // Initial: 2 + 5 + 2 + 3 = 12 lines (2 pages); the budget is 1 page, so 2 bullets must go.
    const candidates: FitCandidates = {
      positions: [
        position('current', '2022-01', null, 0.9, 0.3, 0.8, 0.7, 0.6),
        position('recent', '2020-01', '2021-12', 0.5, 0.2, 0.4),
      ],
      projects: [],
    };

    const result = await fitToPages(candidates, fakeMeasure(), { pageBudget: 1, today: TODAY });

    expect(result).toMatchObject({ pageCount: 1, fits: true });
    expect(result.selection.positions).toEqual([
      { id: 'current', bulletIds: ['current-1', 'current-3', 'current-4', 'current-5'] },
      { id: 'recent', bulletIds: ['recent-1', 'recent-3'] },
    ]);
    expect(result.log).toEqual([
      {
        owner: { type: 'position', id: 'current' },
        bulletId: 'current-2',
        action: 'LEFT_OUT',
        reason: 'OVER_BUDGET',
      },
      {
        owner: { type: 'position', id: 'recent' },
        bulletId: 'recent-2',
        action: 'LEFT_OUT',
        reason: 'OVER_BUDGET',
      },
    ]);
  });

  it('always keeps the bullets the user pinned, even when the CV no longer fits', async () => {
    const recent = position('recent', '2020-01', '2021-12', 0.5, 0.2, 0.4, 0.1);
    // The lowest-scored ones, pinned: they count towards the limit of 3 and are never trimmed.
    recent.bullets[1]!.pinned = true;
    recent.bullets[3]!.pinned = true;
    const old = position('old', '2010-01', '2012-12', 0.9);
    old.bullets[0]!.pinned = true;
    const candidates: FitCandidates = {
      positions: [position('current', '2022-01', null, 0.9, 0.8, 0.7, 0.6, 0.5), recent, old],
      projects: [],
    };

    // 2 + 5 + 2 + 3 + 2 + 1 = 15 lines; with 6 per page, even trimming every unpinned bullet but the
    // minimum leaves 2 + 1 + 2 + 2 + 2 + 1 = 10 lines: two pages.
    const result = await fitToPages(candidates, fakeMeasure(6), { pageBudget: 1, today: TODAY });

    expect(result).toMatchObject({ pageCount: 2, fits: false });
    expect(result.selection.positions).toEqual([
      { id: 'current', bulletIds: ['current-1'] },
      { id: 'recent', bulletIds: ['recent-2', 'recent-4'] },
      // Even an old position shows a bullet the user pinned.
      { id: 'old', bulletIds: ['old-1'] },
    ]);
  });

  it('fills the remaining space with the best bullets left out', async () => {
    // Two pages hold 20 lines; the old position is kept with no bullets (RN-07).
    const candidates: FitCandidates = {
      positions: [
        position('current', '2022-01', null, 0.9, 0.9, 0.9, 0.9, 0.9, 0.8, 0.7, 0.2),
        position('recent', '2020-01', '2021-12', 0.9, 0.9, 0.9, 0.6, 0.5),
        position('old', '2010-01', '2012-12', 1, 1),
      ],
      projects: [],
    };

    const result = await fitToPages(candidates, fakeMeasure(), { pageBudget: 2, today: TODAY });

    // The old position's header takes 2 lines (14 in all), so 6 are left: all 5 extra bullets fit.
    expect(result).toMatchObject({ pageCount: 2, fits: true });
    expect(result.selection.positions[0]?.bulletIds).toHaveLength(8);
    expect(result.selection.positions[1]?.bulletIds).toHaveLength(5);
    expect(result.selection.positions[2]).toEqual({ id: 'old', bulletIds: [] });
    const added = result.log
      .filter((entry) => entry.action === 'ADDED')
      .map((entry) => entry.bulletId);
    // The log is grouped by position, best bullets first.
    expect(added).toEqual(['current-6', 'current-7', 'current-8', 'recent-4', 'recent-5']);
  });

  it('stops filling at the first bullets that no longer fit', async () => {
    // Initial: 2 + 5 = 7 lines of 10; 3 of the 5 extra bullets fit.
    const candidates: FitCandidates = {
      positions: [position('current', '2022-01', null, 1, 1, 1, 1, 1, 0.9, 0.8, 0.7, 0.6, 0.5)],
      projects: [],
    };

    const result = await fitToPages(candidates, fakeMeasure(), { pageBudget: 1, today: TODAY });

    expect(result.selection.positions[0]?.bulletIds).toHaveLength(8);
    expect(result.log.filter((entry) => entry.action === 'ADDED')).toHaveLength(3);
  });

  it('keeps at least one bullet per recent position, and says when it still does not fit', async () => {
    // Four recent positions with 1 bullet each: 4 × 3 = 12 lines, over one page, and nothing can be removed.
    const candidates: FitCandidates = {
      positions: [
        position('a', '2025-01', null, 0.1, 0.2),
        position('b', '2024-01', '2024-12', 0.1),
        position('c', '2023-01', '2023-12', 0.1),
        position('d', '2022-01', '2022-12', 0.1),
      ],
      projects: [],
    };

    const result = await fitToPages(candidates, fakeMeasure(), { pageBudget: 1, today: TODAY });

    expect(result).toMatchObject({ pageCount: 2, fits: false });
    expect(result.selection.positions.map((p) => p.bulletIds)).toEqual([
      ['a-2'],
      ['b-1'],
      ['c-1'],
      ['d-1'],
    ]);
  });

  it('drops a project whose bullets were all removed', async () => {
    // 2 + 5 + 1 + 1 = 9 lines with 8 per page: the project's only bullet has the lowest score.
    const candidates: FitCandidates = {
      positions: [position('current', '2022-01', null, 0.9, 0.9, 0.9, 0.9, 0.9)],
      projects: [{ id: 'side', relevant: true, bullets: bullets('side-', 0.1) }],
    };

    const result = await fitToPages(candidates, fakeMeasure(8), { pageBudget: 1, today: TODAY });

    expect(result.selection.projects).toEqual([]);
    expect(result.log).toEqual([
      {
        owner: { type: 'project', id: 'side' },
        bulletId: null,
        action: 'LEFT_OUT',
        reason: 'OVER_BUDGET',
      },
    ]);
  });

  it('treats the most recent position as current when none is ongoing', async () => {
    const candidates: FitCandidates = {
      positions: [
        position('older', '2015-01', '2019-12', 1, 1, 1, 1),
        position('latest', '2020-01', '2024-06', 1, 1, 1, 1, 1, 1),
      ],
      projects: [],
    };

    const result = await fitToPages(candidates, fakeMeasure(100), {
      pageBudget: 1,
      today: TODAY,
      rules: { maxMeasurements: 1 },
    });

    expect(result.selection.positions.map((p) => [p.id, p.bulletIds.length])).toEqual([
      ['latest', 5],
      ['older', 3],
    ]);
  });

  it('never measures more than the limit', async () => {
    const candidates: FitCandidates = {
      positions: [position('current', '2022-01', null, ...Array.from({ length: 40 }, () => 0.5))],
      projects: [],
    };
    const measure = fakeMeasure(3);

    const result = await fitToPages(candidates, measure, {
      pageBudget: 1,
      today: TODAY,
      rules: { maxMeasurements: 4 },
    });

    expect(measure.calls).toHaveLength(4);
    expect(result.fits).toBe(false);
  });

  it('is deterministic', async () => {
    const candidates: FitCandidates = {
      positions: [
        position('current', '2022-01', null, 0.5, 0.5, 0.5, 0.5, 0.5),
        position('recent', '2020-01', '2021-12', 0.5, 0.5, 0.5),
      ],
      projects: [],
    };

    const first = await fitToPages(candidates, fakeMeasure(), { pageBudget: 1, today: TODAY });
    const second = await fitToPages(candidates, fakeMeasure(), { pageBudget: 1, today: TODAY });

    expect(second).toEqual(first);
    // Ties: the later position and the later bullet go first.
    expect(first.log.map((entry) => entry.bulletId)).toEqual(['recent-2', 'recent-3']);
  });
});
