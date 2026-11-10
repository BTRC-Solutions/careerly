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
import { ProfileNotFoundError, ProfileValidationError } from '../domain/profile-errors.js';
import { assertDateRange, assertIsPermutation } from '../domain/profile-rules.js';
import {
  type AchievementParent,
  type ContainerKind,
  ExperienceRepository,
  type NewElement,
} from './profile.repositories.js';

const LABELS: Record<ContainerKind, string> = { position: 'Position', project: 'Project' };

/** Work experience and projects with their achievements (RF-PROF-02 to RF-PROF-04). */
@Injectable()
export class ExperienceService {
  constructor(private readonly repository: ExperienceRepository) {}

  // --- Positions -----------------------------------------------------------

  async getPosition(id: string): Promise<Position> {
    const position = await this.repository.findPosition(id);
    if (!position) throw new ProfileNotFoundError(LABELS.position);
    return position;
  }

  async createPosition({ toolIds, ...fields }: CreatePositionRequest): Promise<Position> {
    assertDateRange(fields.startDate, fields.endDate);
    await this.assertToolsExist(toolIds);
    const element = newElement();
    await this.repository.insertPosition(element, fields, toolIds);
    return this.getPosition(element.id);
  }

  async updatePosition(
    id: string,
    { toolIds, ...fields }: UpdatePositionRequest,
  ): Promise<Position> {
    const current = await this.getPosition(id);
    assertDateRange(
      fields.startDate ?? current.startDate,
      'endDate' in fields ? (fields.endDate ?? null) : current.endDate,
    );
    if (toolIds) await this.assertToolsExist(toolIds);
    await this.repository.updateContainer('position', id, fields, toolIds, now());
    return this.getPosition(id);
  }

  // --- Projects ------------------------------------------------------------

  async getProject(id: string): Promise<Project> {
    const project = await this.repository.findProject(id);
    if (!project) throw new ProfileNotFoundError(LABELS.project);
    return project;
  }

  async createProject({ toolIds, ...fields }: CreateProjectRequest): Promise<Project> {
    assertDateRange(fields.startDate, fields.endDate);
    await this.assertToolsExist(toolIds);
    const element = newElement();
    await this.repository.insertProject(element, fields, toolIds);
    return this.getProject(element.id);
  }

  async updateProject(id: string, { toolIds, ...fields }: UpdateProjectRequest): Promise<Project> {
    const current = await this.getProject(id);
    assertDateRange(
      'startDate' in fields ? (fields.startDate ?? null) : current.startDate,
      'endDate' in fields ? (fields.endDate ?? null) : current.endDate,
    );
    if (toolIds) await this.assertToolsExist(toolIds);
    await this.repository.updateContainer('project', id, fields, toolIds, now());
    return this.getProject(id);
  }

  // --- Positions and projects ----------------------------------------------

  async delete(kind: ContainerKind, id: string): Promise<void> {
    if (!(await this.repository.deleteContainer(kind, id))) {
      throw new ProfileNotFoundError(LABELS[kind]);
    }
  }

  // --- Achievements ----------------------------------------------------------

  async createAchievement(
    parent: AchievementParent,
    { toolIds, ...fields }: CreateAchievementRequest,
  ): Promise<Achievement> {
    await this.assertParentExists(parent);
    await this.assertToolsExist(toolIds);
    const element = newElement();
    await this.repository.insertAchievement(parent, element, fields, toolIds);
    return this.getAchievement(element.id);
  }

  async getAchievement(id: string): Promise<Achievement> {
    const found = await this.repository.findAchievement(id);
    if (!found) throw new ProfileNotFoundError('Achievement');
    return found.achievement;
  }

  async updateAchievement(
    id: string,
    { toolIds, ...fields }: UpdateAchievementRequest,
  ): Promise<Achievement> {
    await this.getAchievement(id);
    if (toolIds) await this.assertToolsExist(toolIds);
    await this.repository.updateAchievement(id, fields, toolIds, now());
    return this.getAchievement(id);
  }

  async deleteAchievement(id: string): Promise<void> {
    if (!(await this.repository.deleteAchievement(id))) {
      throw new ProfileNotFoundError('Achievement');
    }
  }

  /** Sets the order of all the achievements of a position or project. Returns the new order. */
  async reorderAchievements(parent: AchievementParent, orderedIds: string[]): Promise<string[]> {
    await this.assertParentExists(parent);
    assertIsPermutation(await this.repository.listAchievementIds(parent), orderedIds);
    await this.repository.reorderAchievements(parent, orderedIds);
    return this.repository.listAchievementIds(parent);
  }

  // --- Helpers -----------------------------------------------------------------

  private async assertParentExists(parent: AchievementParent) {
    if (parent.kind === 'position') await this.getPosition(parent.id);
    else await this.getProject(parent.id);
  }

  private async assertToolsExist(toolIds: string[]) {
    if (toolIds.length === 0) return;
    const existing = await this.repository.findExistingToolIds(toolIds);
    const unknown = toolIds.filter((id) => !existing.has(id));
    if (unknown.length > 0) {
      throw new ProfileValidationError(`Unknown tool id(s): ${unknown.join(', ')}.`);
    }
  }
}

function now(): string {
  return new Date().toISOString();
}

/** Every element created through the HTTP API is MANUAL (RF-PROF-07). */
function newElement(): NewElement {
  return { id: randomUUID(), origin: 'MANUAL', originSessionId: null, now: now() };
}
