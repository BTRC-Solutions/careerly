import {
  type Achievement,
  type Position,
  type Project,
  ProjectKindSchema,
  type ToolRef,
  WorkModeSchema,
} from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import type { BatchItem } from 'drizzle-orm/batch';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DatabaseService } from '../../../platform/database/database.service.js';
import {
  achievements,
  achievementTools,
  positions,
  positionTools,
  projects,
  projectTools,
  tools,
} from '../../../platform/database/schema.js';
import {
  type AchievementFields,
  type AchievementParent,
  type ContainerKind,
  ExperienceRepository,
  type NewElement,
  type PositionFields,
  type ProjectFields,
} from '../application/profile.repositories.js';
import { asBatch, definedOnly, enumOf, provenanceOf } from './profile-row-mappers.js';

type LinkTable = typeof positionTools | typeof projectTools | typeof achievementTools;
type AchievementRow = typeof achievements.$inferSelect;

const PARENT_COLUMN = {
  position: achievements.positionId,
  project: achievements.projectId,
} as const;

@Injectable()
export class DrizzleExperienceRepository extends ExperienceRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  private get db() {
    return this.database.db;
  }

  // --- Positions -------------------------------------------------------------

  async listPositions(): Promise<Position[]> {
    return this.loadPositions(await this.db.select().from(positions));
  }

  async findPosition(id: string): Promise<Position | undefined> {
    const [position] = await this.loadPositions(
      await this.db.select().from(positions).where(eq(positions.id, id)),
    );
    return position;
  }

  async insertPosition(element: NewElement, fields: PositionFields, toolIds: string[]) {
    await this.db.batch(
      asBatch([
        this.db.insert(positions).values({ ...fields, ...provenanceColumns(element) }),
        ...this.linkTools(positionTools, element.id, toolIds),
      ]),
    );
  }

  private async loadPositions(rows: (typeof positions.$inferSelect)[]): Promise<Position[]> {
    const ids = rows.map((row) => row.id);
    const [toolsByOwner, achievementsByParent] = await Promise.all([
      this.toolsOf(positionTools, ids),
      this.achievementsOf('position', ids),
    ]);
    return rows.map((row) => ({
      id: row.id,
      company: row.company,
      title: row.title,
      location: row.location,
      workMode: enumOf(WorkModeSchema.nullable(), row.workMode, null),
      startDate: row.startDate,
      endDate: row.endDate,
      context: row.context,
      tools: toolsByOwner.get(row.id) ?? [],
      achievements: achievementsByParent.get(row.id) ?? [],
      ...provenanceOf(row),
    }));
  }

  // --- Projects ----------------------------------------------------------------

  async listProjects(): Promise<Project[]> {
    return this.loadProjects(await this.db.select().from(projects));
  }

  async findProject(id: string): Promise<Project | undefined> {
    const [project] = await this.loadProjects(
      await this.db.select().from(projects).where(eq(projects.id, id)),
    );
    return project;
  }

  async insertProject(element: NewElement, fields: ProjectFields, toolIds: string[]) {
    await this.db.batch(
      asBatch([
        this.db.insert(projects).values({ ...fields, ...provenanceColumns(element) }),
        ...this.linkTools(projectTools, element.id, toolIds),
      ]),
    );
  }

  private async loadProjects(rows: (typeof projects.$inferSelect)[]): Promise<Project[]> {
    const ids = rows.map((row) => row.id);
    const [toolsByOwner, achievementsByParent] = await Promise.all([
      this.toolsOf(projectTools, ids),
      this.achievementsOf('project', ids),
    ]);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: enumOf(ProjectKindSchema, row.kind, 'PERSONAL'),
      role: row.role,
      url: row.url,
      startDate: row.startDate,
      endDate: row.endDate,
      description: row.description,
      tools: toolsByOwner.get(row.id) ?? [],
      achievements: achievementsByParent.get(row.id) ?? [],
      ...provenanceOf(row),
    }));
  }

  // --- Positions and projects --------------------------------------------------

  async updateContainer(
    kind: ContainerKind,
    id: string,
    fields: Partial<PositionFields> | Partial<ProjectFields>,
    toolIds: string[] | undefined,
    now: string,
  ) {
    const update =
      kind === 'position'
        ? this.db
            .update(positions)
            .set({ ...definedOnly(fields as Partial<PositionFields>), updatedAt: now })
            .where(eq(positions.id, id))
        : this.db
            .update(projects)
            .set({ ...definedOnly(fields as Partial<ProjectFields>), updatedAt: now })
            .where(eq(projects.id, id));
    const links = kind === 'position' ? positionTools : projectTools;
    await this.db.batch(
      asBatch([update, ...(toolIds ? this.replaceTools(links, id, toolIds) : [])]),
    );
  }

  async deleteContainer(kind: ContainerKind, id: string): Promise<boolean> {
    // Achievements and tool links are removed by ON DELETE CASCADE.
    const deleted =
      kind === 'position'
        ? await this.db
            .delete(positions)
            .where(eq(positions.id, id))
            .returning({ id: positions.id })
        : await this.db.delete(projects).where(eq(projects.id, id)).returning({ id: projects.id });
    return deleted.length > 0;
  }

  // --- Achievements ------------------------------------------------------------

  async findAchievement(id: string) {
    const row = await this.db.select().from(achievements).where(eq(achievements.id, id)).get();
    if (!row) return undefined;
    const toolsByOwner = await this.toolsOf(achievementTools, [row.id]);
    const parent: AchievementParent = row.positionId
      ? { kind: 'position', id: row.positionId }
      : { kind: 'project', id: row.projectId ?? '' };
    return { achievement: toAchievement(row, toolsByOwner.get(row.id) ?? []), parent };
  }

  async listAchievementIds(parent: AchievementParent): Promise<string[]> {
    const rows = await this.db
      .select({ id: achievements.id })
      .from(achievements)
      .where(eq(PARENT_COLUMN[parent.kind], parent.id))
      .orderBy(asc(achievements.sortOrder), asc(achievements.createdAt));
    return rows.map((row) => row.id);
  }

  async insertAchievement(
    parent: AchievementParent,
    element: NewElement,
    fields: AchievementFields,
    toolIds: string[],
  ) {
    const parentColumn = PARENT_COLUMN[parent.kind];
    // Computed inside the INSERT so concurrent appends cannot read the same maximum.
    const nextSortOrder = sql<number>`(SELECT COALESCE(MAX(${achievements.sortOrder}), -1) + 1 FROM ${achievements} WHERE ${parentColumn} = ${parent.id})`;
    await this.db.batch(
      asBatch([
        this.db.insert(achievements).values({
          ...fields,
          positionId: parent.kind === 'position' ? parent.id : null,
          projectId: parent.kind === 'project' ? parent.id : null,
          sortOrder: nextSortOrder,
          ...provenanceColumns(element),
        }),
        ...this.linkTools(achievementTools, element.id, toolIds),
      ]),
    );
  }

  async updateAchievement(
    id: string,
    fields: Partial<AchievementFields>,
    toolIds: string[] | undefined,
    now: string,
  ) {
    await this.db.batch(
      asBatch([
        this.db
          .update(achievements)
          .set({ ...definedOnly(fields), updatedAt: now })
          .where(eq(achievements.id, id)),
        ...(toolIds ? this.replaceTools(achievementTools, id, toolIds) : []),
      ]),
    );
  }

  async deleteAchievement(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(achievements)
      .where(eq(achievements.id, id))
      .returning({ id: achievements.id });
    return deleted.length > 0;
  }

  async reorderAchievements(parent: AchievementParent, orderedIds: string[]) {
    // Reordering is not a content change, so `updated_at` is left as is.
    await this.db.batch(
      asBatch(
        orderedIds.map((id, index) =>
          this.db
            .update(achievements)
            .set({ sortOrder: index })
            .where(and(eq(achievements.id, id), eq(PARENT_COLUMN[parent.kind], parent.id))),
        ),
      ),
    );
  }

  async findExistingToolIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db.select({ id: tools.id }).from(tools).where(inArray(tools.id, ids));
    return new Set(rows.map((row) => row.id));
  }

  // --- Helpers -----------------------------------------------------------------

  private async achievementsOf(
    kind: ContainerKind,
    parentIds: string[],
  ): Promise<Map<string, Achievement[]>> {
    const result = new Map<string, Achievement[]>();
    if (parentIds.length === 0) return result;

    const parentColumn = PARENT_COLUMN[kind];
    const rows = await this.db
      .select()
      .from(achievements)
      .where(inArray(parentColumn, parentIds))
      .orderBy(asc(achievements.sortOrder), asc(achievements.createdAt));
    const toolsByOwner = await this.toolsOf(
      achievementTools,
      rows.map((row) => row.id),
    );

    for (const row of rows) {
      const parentId = (kind === 'position' ? row.positionId : row.projectId) ?? '';
      const list = result.get(parentId) ?? [];
      list.push(toAchievement(row, toolsByOwner.get(row.id) ?? []));
      result.set(parentId, list);
    }
    return result;
  }

  /** Tools linked to each owner, alphabetically. */
  private async toolsOf(links: LinkTable, ownerIds: string[]): Promise<Map<string, ToolRef[]>> {
    const result = new Map<string, ToolRef[]>();
    if (ownerIds.length === 0) return result;

    const rows = await this.db
      .select({ ownerId: links.ownerId, id: tools.id, name: tools.name })
      .from(links)
      .innerJoin(tools, eq(tools.id, links.toolId))
      .where(inArray(links.ownerId, ownerIds))
      .orderBy(sql`${tools.name} COLLATE NOCASE`);
    for (const { ownerId, id, name } of rows) {
      const list = result.get(ownerId) ?? [];
      list.push({ id, name });
      result.set(ownerId, list);
    }
    return result;
  }

  private linkTools(links: LinkTable, ownerId: string, toolIds: string[]): BatchItem<'sqlite'>[] {
    if (toolIds.length === 0) return [];
    return [this.db.insert(links).values(toolIds.map((toolId) => ({ ownerId, toolId })))];
  }

  private replaceTools(links: LinkTable, ownerId: string, toolIds: string[]) {
    return [
      this.db.delete(links).where(eq(links.ownerId, ownerId)),
      ...this.linkTools(links, ownerId, toolIds),
    ];
  }
}

function provenanceColumns(element: NewElement) {
  return {
    id: element.id,
    origin: element.origin,
    originSessionId: element.originSessionId,
    createdAt: element.now,
    updatedAt: element.now,
  };
}

function toAchievement(row: AchievementRow, rowTools: ToolRef[]): Achievement {
  return {
    id: row.id,
    text: row.text,
    metrics: row.metrics,
    tools: rowTools,
    ...provenanceOf(row),
  };
}
