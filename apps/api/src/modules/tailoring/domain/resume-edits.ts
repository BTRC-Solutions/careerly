/*
 * The user's changes to a tailored CV under review (RF-TAIL-12, RN-05). Pure: the caller fits the CV to its
 * pages again afterwards.
 *
 * - An edited bullet is marked `editedByUser`: the truthfulness guard no longer checks it (RN-05), and it keeps
 *   its sources, so the review still shows where it came from.
 * - Moving a bullet changes its place inside its own position or project, never to another one.
 */

import type {
  EditTailoredResumeRequest,
  TailoredBullet,
  TailoredResumeData,
} from '@careerly/contracts';

/** The bullet does not exist in this CV (maps to 404). */
export class BulletNotFoundError extends Error {
  constructor(readonly bulletId: string) {
    super('That bullet is not in this CV.');
    this.name = 'BulletNotFoundError';
  }
}

export function applyResumeEdit(
  data: TailoredResumeData,
  edit: EditTailoredResumeRequest,
): TailoredResumeData {
  if (edit.op === 'EDIT_SUMMARY') {
    const text = edit.text.trim();
    return {
      ...data,
      summary: text === '' ? null : { text, sourceIds: data.summary?.sourceIds ?? [] },
    };
  }

  const owner = data.experiences.find((e) => e.bullets.some((b) => b.id === edit.bulletId));
  if (!owner) throw new BulletNotFoundError(edit.bulletId);
  const update = (change: (bullets: TailoredBullet[]) => TailoredBullet[]) => ({
    ...data,
    experiences: data.experiences.map((e) =>
      e === owner ? { ...e, bullets: change(e.bullets) } : e,
    ),
  });

  switch (edit.op) {
    case 'EDIT_BULLET': {
      const text = edit.text.trim();
      return update((bullets) =>
        bullets.map((b) =>
          b.id === edit.bulletId && b.text !== text ? { ...b, text, editedByUser: true } : b,
        ),
      );
    }
    case 'SET_INCLUSION':
      return update((bullets) =>
        bullets.map((b) => (b.id === edit.bulletId ? { ...b, inclusion: edit.inclusion } : b)),
      );
    case 'MOVE_BULLET':
      return update((bullets) => {
        const moving = bullets.find((b) => b.id === edit.bulletId)!;
        const rest = bullets.filter((b) => b.id !== edit.bulletId);
        const index = Math.min(edit.toIndex, rest.length);
        return [...rest.slice(0, index), moving, ...rest.slice(index)];
      });
  }
}
