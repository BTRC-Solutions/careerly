import type { FitReason, Profile, TailoredBullet, TailoredResumeData } from '@careerly/contracts';
import { type DescribedEvidence, describeEvidence } from './match-summary';

/*
 * What the review screen shows of a tailored CV (roadmap 6.6, RF-TAIL-12): its positions and projects in the
 * CV's order, each bullet with whether it is in the CV (and why not) and the profile elements it comes from.
 */

export type BulletState =
  /** In the CV. */
  | { kind: 'IN' }
  /** Left out by the page fit (RN-04, RN-07). */
  | { kind: 'LEFT_OUT'; reason: FitReason }
  /** Left out by the user. */
  | { kind: 'EXCLUDED' };

export interface ReviewBullet {
  bullet: TailoredBullet;
  /** Place inside its experience, to move it up or down. */
  index: number;
  state: BulletState;
  /** The profile elements it cites; `null` for one deleted from the profile since. */
  sources: (DescribedEvidence | null)[];
}

export interface ReviewExperience {
  kind: 'POSITION' | 'PROJECT';
  id: string;
  /** "Backend Engineer · Acme", or the project's name. */
  title: string;
  bullets: ReviewBullet[];
}

export function reviewExperiences(data: TailoredResumeData, profile: Profile): ReviewExperience[] {
  const selected = new Set(
    data.fit
      ? [...data.fit.selection.positions, ...data.fit.selection.projects].flatMap(
          (o) => o.bulletIds,
        )
      : data.experiences.flatMap((e) => e.bullets.map((b) => b.id)),
  );
  const reasons = new Map(
    (data.fit?.log ?? []).flatMap((entry) =>
      entry.bulletId && entry.action === 'LEFT_OUT' ? [[entry.bulletId, entry.reason]] : [],
    ),
  );
  const stateOf = (bullet: TailoredBullet): BulletState =>
    bullet.inclusion === 'EXCLUDED'
      ? { kind: 'EXCLUDED' }
      : selected.has(bullet.id)
        ? { kind: 'IN' }
        : { kind: 'LEFT_OUT', reason: reasons.get(bullet.id) ?? 'OVER_BUDGET' };
  const sourcesOf = (bullet: TailoredBullet) =>
    bullet.sourceIds.map(
      (id) =>
        describeEvidence({ kind: 'ACHIEVEMENT', id }, profile) ??
        describeEvidence({ kind: 'PROJECT', id }, profile),
    );
  const bulletsOf = (kind: 'POSITION' | 'PROJECT', id: string): ReviewBullet[] =>
    (data.experiences.find((e) => e.kind === kind && e.sourceId === id)?.bullets ?? []).map(
      (bullet, index) => ({ bullet, index, state: stateOf(bullet), sources: sourcesOf(bullet) }),
    );

  const positions = [...profile.positions]
    .sort(
      (a, b) =>
        (b.endDate ?? '9999-12').localeCompare(a.endDate ?? '9999-12') ||
        b.startDate.localeCompare(a.startDate),
    )
    .map((p): ReviewExperience => ({
      kind: 'POSITION',
      id: p.id,
      title: [p.title, p.company].filter(Boolean).join(' · '),
      bullets: bulletsOf('POSITION', p.id),
    }));
  const projects = profile.projects
    .map((p): ReviewExperience => ({
      kind: 'PROJECT',
      id: p.id,
      title: p.name,
      bullets: bulletsOf('PROJECT', p.id),
    }))
    .filter((p) => p.bullets.length > 0);
  return [...positions, ...projects];
}
