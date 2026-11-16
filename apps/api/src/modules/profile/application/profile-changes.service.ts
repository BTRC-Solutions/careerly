import { randomUUID } from 'node:crypto';
import type {
  Achievement,
  CreateAchievementRequest,
  CreatePositionRequest,
  CreateProjectRequest,
  Position,
  Project,
  UpdateAchievementRequest,
  UpdatePositionRequest,
  UpdateProjectRequest,
} from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import {
  type ChangedEntity,
  type CurrentElement,
  elementKey,
  type FieldValues,
  planRevert,
  type ProfileChange,
  type RevertPlan,
  selectChanges,
} from '../domain/profile-changes.js';
import { ExperienceService } from './experience.service.js';
import {
  type AchievementParent,
  type ElementOrigin,
  ExperienceRepository,
  ProfileChangeRepository,
} from './profile.repositories.js';

type Element = Position | Project | Achievement;

/**
 * Profile writes that come from answering gaps in a tailoring session (RF-PROF-07, RF-TAIL-06).
 * New elements get origin `GAP_ANSWER` with the session, and every write is logged so the session's
 * changes can be undone, all or one by one. Tailoring (F5) uses this service; there is no HTTP API
 * of its own.
 */
@Injectable()
export class ProfileChangesService {
  constructor(
    private readonly experience: ExperienceService,
    private readonly repository: ExperienceRepository,
    private readonly changes: ProfileChangeRepository,
  ) {}

  // --- Writes from gap answers -------------------------------------------------

  createPosition(sessionId: string, request: CreatePositionRequest): Promise<Position> {
    return this.logCreation(sessionId, 'position', () =>
      this.experience.createPosition(request, gapOrigin(sessionId)),
    );
  }

  createProject(sessionId: string, request: CreateProjectRequest): Promise<Project> {
    return this.logCreation(sessionId, 'project', () =>
      this.experience.createProject(request, gapOrigin(sessionId)),
    );
  }

  createAchievement(
    sessionId: string,
    parent: AchievementParent,
    request: CreateAchievementRequest,
  ): Promise<Achievement> {
    return this.logCreation(sessionId, 'achievement', () =>
      this.experience.createAchievement(parent, request, gapOrigin(sessionId)),
    );
  }

  async updatePosition(
    sessionId: string,
    id: string,
    patch: UpdatePositionRequest,
  ): Promise<Position> {
    const before = await this.experience.getPosition(id);
    const after = await this.experience.updatePosition(id, patch);
    await this.logUpdate(sessionId, 'position', patch, before, after);
    return after;
  }

  async updateProject(
    sessionId: string,
    id: string,
    patch: UpdateProjectRequest,
  ): Promise<Project> {
    const before = await this.experience.getProject(id);
    const after = await this.experience.updateProject(id, patch);
    await this.logUpdate(sessionId, 'project', patch, before, after);
    return after;
  }

  async updateAchievement(
    sessionId: string,
    id: string,
    patch: UpdateAchievementRequest,
  ): Promise<Achievement> {
    const before = await this.experience.getAchievement(id);
    const after = await this.experience.updateAchievement(id, patch);
    await this.logUpdate(sessionId, 'achievement', patch, before, after);
    return after;
  }

  // --- Undo --------------------------------------------------------------------

  /** The session's changes, oldest first (reverted ones included, with `revertedAt`). */
  listChanges(sessionId: string): Promise<ProfileChange[]> {
    return this.changes.listBySession(sessionId);
  }

  /** Undoes the session's pending changes, or only `changeIds`. */
  async revert(sessionId: string, changeIds?: string[]): Promise<RevertPlan> {
    const selected = selectChanges(await this.changes.listBySession(sessionId), changeIds);

    const current = new Map<string, CurrentElement>();
    for (const { entity, entityId } of selected) {
      const key = elementKey(entity, entityId);
      if (current.has(key)) continue;
      const element = await this.find(entity, entityId);
      if (element) current.set(key, { fields: fieldsOf(element), updatedAt: element.updatedAt });
    }

    const plan = planRevert(selected, current);
    const at = now();
    for (const step of plan.steps) {
      if (step.action === 'DELETE') await this.delete(step.entity, step.entityId);
      else await this.restore(step.entity, step.entityId, step.fields, step.updatedAt ?? at);
    }
    await this.changes.markReverted(plan.revertedChangeIds, at);
    return plan;
  }

  // --- Helpers -------------------------------------------------------------------

  /** Creates the element, then logs it; if logging fails, the element is removed again. */
  private async logCreation<T extends Element>(
    sessionId: string,
    entity: ChangedEntity,
    create: () => Promise<T>,
  ): Promise<T> {
    const element = await create();
    try {
      await this.changes.insert({
        id: randomUUID(),
        sessionId,
        entity,
        entityId: element.id,
        kind: 'CREATE',
        createdAt: element.createdAt,
        revertedAt: null,
      });
    } catch (error) {
      await this.delete(entity, element.id);
      throw error;
    }
    return element;
  }

  /** Logs the fields the patch touched; if logging fails, they are put back. */
  private async logUpdate(
    sessionId: string,
    entity: ChangedEntity,
    patch: object,
    before: Element,
    after: Element,
  ) {
    const touched = Object.keys(patch);
    const beforeFields = pick(fieldsOf(before), touched);
    try {
      await this.changes.insert({
        id: randomUUID(),
        sessionId,
        entity,
        entityId: after.id,
        kind: 'UPDATE',
        before: beforeFields,
        after: pick(fieldsOf(after), touched),
        previousUpdatedAt: before.updatedAt,
        resultUpdatedAt: after.updatedAt,
        createdAt: after.updatedAt,
        revertedAt: null,
      });
    } catch (error) {
      await this.restore(entity, after.id, beforeFields, before.updatedAt);
      throw error;
    }
  }

  private async find(entity: ChangedEntity, id: string): Promise<Element | undefined> {
    if (entity === 'position') return this.repository.findPosition(id);
    if (entity === 'project') return this.repository.findProject(id);
    return (await this.repository.findAchievement(id))?.achievement;
  }

  private async delete(entity: ChangedEntity, id: string) {
    if (entity === 'achievement') await this.repository.deleteAchievement(id);
    else await this.repository.deleteContainer(entity, id);
  }

  /** Writes back logged values. Tools removed from the catalog since then are left out. */
  private async restore(entity: ChangedEntity, id: string, values: FieldValues, updatedAt: string) {
    const { toolIds: loggedToolIds, ...fields } = values;
    let toolIds: string[] | undefined;
    if (Array.isArray(loggedToolIds)) {
      const existing = await this.repository.findExistingToolIds(loggedToolIds.map(String));
      toolIds = loggedToolIds.map(String).filter((toolId) => existing.has(toolId));
    }
    if (entity === 'achievement') {
      await this.repository.updateAchievement(id, fields, toolIds, updatedAt);
    } else {
      await this.repository.updateContainer(entity, id, fields, toolIds, updatedAt);
    }
  }
}

function gapOrigin(sessionId: string): ElementOrigin {
  return { origin: 'GAP_ANSWER', originSessionId: sessionId };
}

/** Writable fields of an element, with its tools as `toolIds` (the shape of the update requests). */
function fieldsOf(element: Element): FieldValues {
  const {
    id: _id,
    origin: _origin,
    originSessionId: _originSessionId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    tools,
    ...fields
  } = element;
  delete (fields as { achievements?: unknown }).achievements;
  return { ...fields, toolIds: tools.map((tool) => tool.id) };
}

function pick(values: FieldValues, keys: string[]): FieldValues {
  return Object.fromEntries(keys.filter((key) => key in values).map((key) => [key, values[key]]));
}

function now(): string {
  return new Date().toISOString();
}
