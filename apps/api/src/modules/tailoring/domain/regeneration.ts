/*
 * Writing a tailored CV again, whole or in part (RF-TAIL-13). Pure. The AI writes the scope again; then:
 *
 * - `restrictToScope` keeps only what the scope asked for, whatever else the AI wrote.
 * - `mergeRegenerated` puts it into the current CV. What is outside the scope stays as it was, the user's
 *   edits included; inside the scope, the bullets the user edited or pinned are kept (first, in their order)
 *   and the new ones follow. The guard log keeps the entries of what was not written again.
 *
 * The result has no page fit yet: the caller fits it again.
 */

import type {
  GuardDrop,
  RegenerationScope,
  TailoredExperience,
  TailoredResumeData,
} from '@careerly/contracts';

export const WHOLE_CV: RegenerationScope = { kind: 'ALL' };

export function restrictToScope(
  data: TailoredResumeData,
  scope: RegenerationScope,
): TailoredResumeData {
  const inScope = (drop: GuardDrop) =>
    scope.kind === 'ALL' ||
    (scope.kind === 'SUMMARY' ? drop.kind === 'SUMMARY' : drop.experienceId === scope.experienceId);
  return {
    ...data,
    summary: scope.kind === 'ALL' || scope.kind === 'SUMMARY' ? data.summary : null,
    experiences:
      scope.kind === 'ALL'
        ? data.experiences
        : scope.kind === 'EXPERIENCE'
          ? data.experiences.filter((e) => e.sourceId === scope.experienceId)
          : [],
    guard: { rewritten: data.guard.rewritten, dropped: data.guard.dropped.filter(inScope) },
  };
}

export function mergeRegenerated(
  current: TailoredResumeData,
  fresh: TailoredResumeData,
  scope: RegenerationScope,
): TailoredResumeData {
  const inScope = (experienceId: string) =>
    scope.kind === 'ALL' || (scope.kind === 'EXPERIENCE' && scope.experienceId === experienceId);

  const ids = [
    ...new Set([
      ...current.experiences.map((e) => e.sourceId),
      ...fresh.experiences.map((e) => e.sourceId),
    ]),
  ];
  const experiences = ids.flatMap((id): TailoredExperience[] => {
    const before = current.experiences.find((e) => e.sourceId === id);
    if (!inScope(id)) return before ? [before] : [];
    const written = fresh.experiences.find((e) => e.sourceId === id);
    // The user's own: edited, or pinned with "always include". Excluded ones are not worth keeping.
    const kept = before?.bullets.filter((b) => b.editedByUser || b.inclusion === 'INCLUDED') ?? [];
    const bullets = [...kept, ...(written?.bullets ?? [])];
    const kind = (written ?? before)!.kind;
    return bullets.length > 0 ? [{ kind, sourceId: id, bullets }] : [];
  });

  const keptDrops = current.guard.dropped.filter((drop) =>
    drop.kind === 'SUMMARY'
      ? scope.kind !== 'ALL' && scope.kind !== 'SUMMARY'
      : drop.experienceId === null || !inScope(drop.experienceId),
  );
  return {
    summary: scope.kind === 'ALL' || scope.kind === 'SUMMARY' ? fresh.summary : current.summary,
    experiences,
    toolIds: scope.kind === 'ALL' ? fresh.toolIds : current.toolIds,
    guard: {
      rewritten: (scope.kind === 'ALL' ? 0 : current.guard.rewritten) + fresh.guard.rewritten,
      dropped: [...keptDrops, ...fresh.guard.dropped],
    },
    fit: null,
  };
}
