import { ProfileNotFoundError } from './profile-errors.js';

/*
 * Change log of the master profile, per tailoring session (RF-PROF-07, RF-TAIL-06). Answering a gap
 * creates elements or updates existing ones; undoing deletes what the session created and puts back
 * the fields it changed. Pure: the caller loads the current state and applies the plan.
 */

/** Elements a gap answer can create or change. */
export type ChangedEntity = 'position' | 'project' | 'achievement';

/** Field values of an element (writable fields plus `toolIds`), as stored in the log. */
export type FieldValues = Readonly<Record<string, unknown>>;

interface ChangeBase {
  id: string;
  sessionId: string;
  entity: ChangedEntity;
  entityId: string;
  createdAt: string;
  revertedAt: string | null;
}

export type ProfileChange =
  | (ChangeBase & { kind: 'CREATE' })
  | (ChangeBase & {
      kind: 'UPDATE';
      /** Values of the touched fields before and after the update. */
      before: FieldValues;
      after: FieldValues;
      /** `updatedAt` of the element before and right after the update. */
      previousUpdatedAt: string;
      resultUpdatedAt: string;
    });

/** Current state of an element: its field values and `updatedAt`. Absent if it no longer exists. */
export interface CurrentElement {
  fields: FieldValues;
  updatedAt: string;
}

export type RevertStep =
  | { action: 'DELETE'; entity: ChangedEntity; entityId: string }
  | {
      action: 'RESTORE';
      entity: ChangedEntity;
      entityId: string;
      fields: FieldValues;
      /** Previous `updatedAt` when the element is left exactly as before; `null` means "now". */
      updatedAt: string | null;
    };

export interface RevertPlan {
  steps: RevertStep[];
  /** Changes this plan settles, including those with nothing left to undo. */
  revertedChangeIds: string[];
  /** Fields the user edited after the session: they keep the user's value. */
  keptFields: { entity: ChangedEntity; entityId: string; fields: string[] }[];
}

export const elementKey = (entity: ChangedEntity, id: string) => `${entity}:${id}`;

/**
 * The changes to undo: every pending change of the session, or only `changeIds` (RF-TAIL-06).
 * Changes already reverted are skipped; an id that is not from this session is rejected.
 */
export function selectChanges(
  sessionChanges: readonly ProfileChange[],
  changeIds?: readonly string[],
): ProfileChange[] {
  const pending = sessionChanges.filter((change) => change.revertedAt === null);
  if (!changeIds) return pending;
  const known = new Set(sessionChanges.map((change) => change.id));
  if (changeIds.some((id) => !known.has(id))) throw new ProfileNotFoundError('Profile change');
  const wanted = new Set(changeIds);
  return pending.filter((change) => wanted.has(change.id));
}

/**
 * Plans how to undo `changes` given the current state of the elements they touched.
 *
 * - A created element is deleted, newest first (its children created later go before it), and its
 *   updates in the same changes are moot.
 * - An updated field goes back to its value before the session, unless the user changed it since:
 *   then the user's value wins. The element's previous `updatedAt` comes back only when nothing else
 *   touched it after the session.
 * - Elements that no longer exist need nothing.
 */
export function planRevert(
  changes: readonly ProfileChange[],
  current: ReadonlyMap<string, CurrentElement>,
): RevertPlan {
  const ordered = [...changes].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const created = new Set(
    ordered
      .filter((change) => change.kind === 'CREATE')
      .map((c) => elementKey(c.entity, c.entityId)),
  );
  const plan: RevertPlan = {
    steps: [],
    revertedChangeIds: ordered.map((change) => change.id),
    keptFields: [],
  };

  for (const change of [...ordered].reverse()) {
    if (change.kind === 'CREATE' && current.has(elementKey(change.entity, change.entityId))) {
      plan.steps.push({ action: 'DELETE', entity: change.entity, entityId: change.entityId });
    }
  }

  const updatesByElement = new Map<string, Extract<ProfileChange, { kind: 'UPDATE' }>[]>();
  for (const change of ordered) {
    const key = elementKey(change.entity, change.entityId);
    if (change.kind !== 'UPDATE' || created.has(key) || !current.has(key)) continue;
    updatesByElement.set(key, [...(updatesByElement.get(key) ?? []), change]);
  }

  for (const [key, updates] of updatesByElement) {
    const element = current.get(key)!;
    const { entity, entityId } = updates[0]!;
    const fields: Record<string, unknown> = {};
    const kept: string[] = [];
    for (const field of new Set(updates.flatMap((update) => Object.keys(update.before)))) {
      const touching = updates.filter((update) => field in update.before);
      const before = touching[0]!.before[field];
      const after = touching.at(-1)!.after[field];
      if (sameValue(element.fields[field], after)) fields[field] = before;
      else kept.push(field);
    }
    if (kept.length > 0) plan.keptFields.push({ entity, entityId, fields: kept });
    if (Object.keys(fields).length === 0) continue;

    const untouchedSince =
      kept.length === 0 && element.updatedAt === updates.at(-1)!.resultUpdatedAt;
    plan.steps.push({
      action: 'RESTORE',
      entity,
      entityId,
      fields,
      updatedAt: untouchedSince ? updates[0]!.previousUpdatedAt : null,
    });
  }

  return plan;
}

/** Field equality; tool id lists compare as sets. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  }
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
