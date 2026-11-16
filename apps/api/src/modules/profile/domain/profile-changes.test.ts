import { describe, expect, it } from 'vitest';
import {
  type ChangedEntity,
  type CurrentElement,
  elementKey,
  type FieldValues,
  planRevert,
  type ProfileChange,
  selectChanges,
} from './profile-changes.js';

/**
 * A tiny in-memory profile that records changes the way the service does, so the tests can check
 * that undoing a session leaves the profile exactly as it was.
 */
class FakeProfile {
  readonly elements = new Map<string, CurrentElement>();
  readonly changes: ProfileChange[] = [];
  private clock = 0;

  private tick() {
    this.clock += 1;
    return `2026-11-16T10:00:${String(this.clock).padStart(2, '0')}.000Z`;
  }

  seed(entity: ChangedEntity, id: string, fields: FieldValues) {
    this.elements.set(elementKey(entity, id), { fields, updatedAt: this.tick() });
  }

  create(sessionId: string, entity: ChangedEntity, id: string, fields: FieldValues) {
    const at = this.tick();
    this.elements.set(elementKey(entity, id), { fields, updatedAt: at });
    this.changes.push({
      id: `c${this.changes.length + 1}`,
      sessionId,
      entity,
      entityId: id,
      kind: 'CREATE',
      createdAt: at,
      revertedAt: null,
    });
  }

  update(sessionId: string | null, entity: ChangedEntity, id: string, patch: FieldValues) {
    const key = elementKey(entity, id);
    const element = this.elements.get(key)!;
    const at = this.tick();
    this.elements.set(key, { fields: { ...element.fields, ...patch }, updatedAt: at });
    if (sessionId === null) return; // a manual edit is not logged
    this.changes.push({
      id: `c${this.changes.length + 1}`,
      sessionId,
      entity,
      entityId: id,
      kind: 'UPDATE',
      before: Object.fromEntries(Object.keys(patch).map((field) => [field, element.fields[field]])),
      after: patch,
      previousUpdatedAt: element.updatedAt,
      resultUpdatedAt: at,
      createdAt: at,
      revertedAt: null,
    });
  }

  /** Plans and applies the revert, then marks the changes as reverted. */
  revert(sessionId: string, changeIds?: string[]) {
    const selected = selectChanges(
      this.changes.filter((change) => change.sessionId === sessionId),
      changeIds,
    );
    const plan = planRevert(selected, this.elements);
    const at = this.tick();
    for (const step of plan.steps) {
      const key = elementKey(step.entity, step.entityId);
      if (step.action === 'DELETE') {
        this.elements.delete(key);
        // Achievements go with their position or project (ON DELETE CASCADE).
        for (const other of this.elements.keys()) {
          if (this.elements.get(other)!.fields.parentId === step.entityId)
            this.elements.delete(other);
        }
      } else {
        const element = this.elements.get(key)!;
        this.elements.set(key, {
          fields: { ...element.fields, ...step.fields },
          updatedAt: step.updatedAt ?? at,
        });
      }
    }
    for (const change of this.changes) {
      if (plan.revertedChangeIds.includes(change.id)) change.revertedAt = at;
    }
    return plan;
  }

  snapshot() {
    return structuredClone(Object.fromEntries(this.elements));
  }
}

function profileWithAPosition() {
  const profile = new FakeProfile();
  profile.seed('position', 'pos-1', { company: 'Acme', title: 'Backend', toolIds: ['go'] });
  profile.seed('achievement', 'ach-1', { parentId: 'pos-1', text: 'Built the API', toolIds: [] });
  return profile;
}

describe('reverting the profile changes of a session', () => {
  it('creating from gaps and reverting leaves the profile as it was', () => {
    const profile = profileWithAPosition();
    const before = profile.snapshot();

    // Answering gaps: a new achievement, a tool on the position and a new project with an achievement.
    profile.create('s1', 'achievement', 'ach-2', {
      parentId: 'pos-1',
      text: 'Ran the Kafka consumers',
      toolIds: ['kafka'],
    });
    profile.update('s1', 'position', 'pos-1', { toolIds: ['go', 'kafka'] });
    profile.create('s1', 'project', 'proj-1', { name: 'Side project', toolIds: ['rust'] });
    profile.create('s1', 'achievement', 'ach-3', { parentId: 'proj-1', text: 'Wrote a CLI' });
    expect(profile.snapshot()).not.toEqual(before);

    const plan = profile.revert('s1');

    expect(profile.snapshot()).toEqual(before);
    expect(plan.keptFields).toEqual([]);
    expect(profile.changes.every((change) => change.revertedAt !== null)).toBe(true);
  });

  it('deletes the newest elements first and ignores updates of elements the session created', () => {
    const profile = profileWithAPosition();
    profile.create('s1', 'project', 'proj-1', { name: 'Side project' });
    profile.update('s1', 'project', 'proj-1', { name: 'Better name' });
    profile.create('s1', 'achievement', 'ach-2', { parentId: 'proj-1', text: 'Wrote a CLI' });

    const plan = planRevert(profile.changes, profile.elements);

    expect(plan.steps).toEqual([
      { action: 'DELETE', entity: 'achievement', entityId: 'ach-2' },
      { action: 'DELETE', entity: 'project', entityId: 'proj-1' },
    ]);
    expect(plan.revertedChangeIds).toEqual(['c1', 'c2', 'c3']);
  });

  it('keeps a field the user edited after the session and restores the rest', () => {
    const profile = profileWithAPosition();
    profile.update('s1', 'position', 'pos-1', {
      title: 'Senior Backend',
      toolIds: ['go', 'kafka'],
    });
    profile.update(null, 'position', 'pos-1', { title: 'Staff Backend' });

    const plan = profile.revert('s1');

    expect(plan.keptFields).toEqual([{ entity: 'position', entityId: 'pos-1', fields: ['title'] }]);
    expect(profile.elements.get('position:pos-1')!.fields).toEqual({
      company: 'Acme',
      title: 'Staff Backend',
      toolIds: ['go'],
    });
  });

  it('restores the previous updatedAt only if nothing touched the element after the session', () => {
    const untouched = profileWithAPosition();
    const original = untouched.elements.get('position:pos-1')!.updatedAt;
    untouched.update('s1', 'position', 'pos-1', { toolIds: ['go', 'kafka'] });
    untouched.revert('s1');
    expect(untouched.elements.get('position:pos-1')!.updatedAt).toBe(original);

    const edited = profileWithAPosition();
    edited.update('s1', 'position', 'pos-1', { toolIds: ['go', 'kafka'] });
    edited.update(null, 'position', 'pos-1', { company: 'Acme Inc.' });
    const plan = planRevert(edited.changes, edited.elements);
    expect(plan.steps).toEqual([
      {
        action: 'RESTORE',
        entity: 'position',
        entityId: 'pos-1',
        fields: { toolIds: ['go'] },
        updatedAt: null,
      },
    ]);
  });

  it('with several updates of the same field, goes back to the value before the first one', () => {
    const profile = profileWithAPosition();
    const before = profile.snapshot();
    profile.update('s1', 'achievement', 'ach-1', { text: 'Built the API in Go' });
    profile.update('s1', 'achievement', 'ach-1', { text: 'Built the API in Go and Kafka' });

    profile.revert('s1');

    expect(profile.snapshot()).toEqual(before);
  });

  it('compares tool ids as a set', () => {
    const profile = profileWithAPosition();
    profile.update('s1', 'position', 'pos-1', { toolIds: ['go', 'kafka'] });
    profile.elements.get('position:pos-1')!.fields = {
      ...profile.elements.get('position:pos-1')!.fields,
      toolIds: ['kafka', 'go'],
    };

    expect(planRevert(profile.changes, profile.elements).keptFields).toEqual([]);
  });

  it('reverts only the chosen changes, and each change only once', () => {
    const profile = profileWithAPosition();
    profile.create('s1', 'achievement', 'ach-2', { parentId: 'pos-1', text: 'Ran Kafka' });
    profile.update('s1', 'position', 'pos-1', { toolIds: ['go', 'kafka'] });

    profile.revert('s1', ['c1']);
    expect(profile.elements.has('achievement:ach-2')).toBe(false);
    expect(profile.elements.get('position:pos-1')!.fields.toolIds).toEqual(['go', 'kafka']);

    expect(profile.revert('s1', ['c1']).revertedChangeIds).toEqual([]);
    expect(profile.revert('s1').revertedChangeIds).toEqual(['c2']);
    expect(profile.elements.get('position:pos-1')!.fields.toolIds).toEqual(['go']);
  });

  it('does not touch the changes of other sessions', () => {
    const profile = profileWithAPosition();
    profile.create('s1', 'achievement', 'ach-2', { parentId: 'pos-1', text: 'From s1' });
    profile.create('s2', 'achievement', 'ach-3', { parentId: 'pos-1', text: 'From s2' });

    profile.revert('s1');

    expect(profile.elements.has('achievement:ach-2')).toBe(false);
    expect(profile.elements.has('achievement:ach-3')).toBe(true);
  });

  it('settles changes of elements that no longer exist without steps', () => {
    const profile = profileWithAPosition();
    profile.create('s1', 'achievement', 'ach-2', { parentId: 'pos-1', text: 'Ran Kafka' });
    profile.update('s1', 'achievement', 'ach-1', { text: 'Changed' });
    profile.elements.delete('achievement:ach-2');
    profile.elements.delete('achievement:ach-1');

    const plan = planRevert(profile.changes, profile.elements);

    expect(plan.steps).toEqual([]);
    expect(plan.revertedChangeIds).toEqual(['c1', 'c2']);
  });

  it('rejects a change id that is not from the session', () => {
    const profile = profileWithAPosition();
    profile.create('s1', 'achievement', 'ach-2', { parentId: 'pos-1', text: 'Ran Kafka' });

    expect(() => selectChanges(profile.changes, ['nope'])).toThrow('Profile change not found.');
  });
});
