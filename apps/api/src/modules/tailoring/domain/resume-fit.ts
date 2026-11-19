/*
 * From a tailored CV to the page fitter's candidates and back (ARCHITECTURE.md §8, RN-04). Pure: the fit itself
 * is `fitToPages`, which measures through the renderer it is given.
 *
 * - Every position of the profile is a candidate, with the bullets written for it (maybe none): old ones stay
 *   in the CV with no bullets (RN-07).
 * - A project is a candidate when the AI wrote bullets for it: the writing prompt already leaves out the ones
 *   unrelated to the job description, so those count as relevant.
 * - A bullet's score is its relevance (roadmap 6.2) or, while there is none, its place in the order of its
 *   experience (the AI's, most relevant first, RN-06, or the user's after moving it): 1 for the first, down to
 *   almost 0 for the last.
 * - The user's choices (RF-TAIL-12): an excluded bullet is not a candidate; an included one is pinned.
 * - The fitted CV shows each experience's bullets in that same order (`orderAsWritten`).
 */

import type {
  FitSelection,
  Profile,
  TailoredBullet,
  TailoredResumeData,
} from '@careerly/contracts';
import type { BulletCandidate, FitCandidates } from './page-fitter.js';

export function fitCandidates(data: TailoredResumeData, profile: Profile): FitCandidates {
  const bulletsOf = (kind: 'POSITION' | 'PROJECT', id: string) =>
    data.experiences.find((e) => e.kind === kind && e.sourceId === id)?.bullets ?? [];

  return {
    positions: profile.positions.map((position) => ({
      id: position.id,
      startDate: position.startDate,
      endDate: position.endDate,
      bullets: scored(bulletsOf('POSITION', position.id)),
    })),
    projects: profile.projects
      .map((project) => ({ id: project.id, bullets: scored(bulletsOf('PROJECT', project.id)) }))
      .filter((project) => project.bullets.length > 0)
      .map((project) => ({ ...project, relevant: true })),
  };
}

/** The selection with each experience's bullets in the CV's own order, not the fitter's (by score). */
export function orderAsWritten(selection: FitSelection, data: TailoredResumeData): FitSelection {
  const order = new Map(
    data.experiences.flatMap((e) => e.bullets.map((bullet, index) => [bullet.id, index] as const)),
  );
  const sort = (owners: FitSelection['positions']) =>
    owners.map((owner) => ({
      ...owner,
      bulletIds: [...owner.bulletIds].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)),
    }));
  return { positions: sort(selection.positions), projects: sort(selection.projects) };
}

function scored(bullets: TailoredBullet[]): BulletCandidate[] {
  const candidates = bullets.filter((bullet) => bullet.inclusion !== 'EXCLUDED');
  return candidates.map((bullet, index) => ({
    id: bullet.id,
    score: bullet.score ?? 1 - index / candidates.length,
    pinned: bullet.inclusion === 'INCLUDED',
  }));
}
