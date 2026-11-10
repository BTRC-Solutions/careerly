import { randomUUID } from 'node:crypto';
import { type Tool, ToolCategorySchema } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { asc, eq, inArray, like, sql } from 'drizzle-orm';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { toolAliases, tools } from '../../../platform/database/schema.js';
import { inTransaction } from '../../../platform/database/sqlite.js';
import { type NewTool, ToolRepository } from '../application/tool.repository.js';

@Injectable()
export class DrizzleToolRepository extends ToolRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async search(normalizedQuery: string | undefined, limit: number): Promise<Tool[]> {
    const { db } = this.database;

    if (!normalizedQuery) {
      const rows = await db
        .select({ id: tools.id })
        .from(tools)
        .orderBy(sql`${tools.name} COLLATE NOCASE`)
        .limit(limit);
      return this.hydrate(rows.map((row) => row.id));
    }

    // Normalized keys only contain letters, digits, '#' and '+', so no LIKE escaping is needed.
    const rank = sql`min(CASE
      WHEN ${toolAliases.normalized} = ${normalizedQuery} THEN 0
      WHEN ${toolAliases.normalized} LIKE ${`${normalizedQuery}%`} THEN 1
      ELSE 2 END)`;
    const rows = await db
      .select({ id: toolAliases.toolId })
      .from(toolAliases)
      .innerJoin(tools, eq(tools.id, toolAliases.toolId))
      .where(like(toolAliases.normalized, `%${normalizedQuery}%`))
      .groupBy(toolAliases.toolId)
      .orderBy(rank, sql`length(${tools.name})`, sql`${tools.name} COLLATE NOCASE`)
      .limit(limit);
    return this.hydrate(rows.map((row) => row.id));
  }

  async findById(id: string): Promise<Tool | undefined> {
    const [tool] = await this.hydrate([id]);
    return tool;
  }

  async findByNormalizedAlias(normalized: string): Promise<Tool | undefined> {
    const row = await this.database.db
      .select({ toolId: toolAliases.toolId })
      .from(toolAliases)
      .where(eq(toolAliases.normalized, normalized))
      .get();
    return row ? this.findById(row.toolId) : undefined;
  }

  async createCustom(tool: NewTool): Promise<Tool> {
    const id = randomUUID();
    const { connection } = this.database;
    // The proxy driver has no transactions, so both inserts run on the raw connection.
    inTransaction(connection, () => {
      connection
        .prepare(
          'INSERT INTO tools (id, seed_slug, name, category, created_at) VALUES (?, NULL, ?, ?, ?)',
        )
        .run(id, tool.name, tool.category, new Date().toISOString());
      connection
        .prepare('INSERT INTO tool_aliases (normalized, alias, tool_id) VALUES (?, ?, ?)')
        .run(tool.normalized, tool.name, id);
    });
    return { id, name: tool.name, category: tool.category, isCustom: true, aliases: [] };
  }

  /** Loads tools with their aliases, keeping the order of `ids`. */
  private async hydrate(ids: string[]): Promise<Tool[]> {
    if (ids.length === 0) return [];
    const { db } = this.database;
    const [toolRows, aliasRows] = await Promise.all([
      db.select().from(tools).where(inArray(tools.id, ids)),
      db
        .select()
        .from(toolAliases)
        .where(inArray(toolAliases.toolId, ids))
        .orderBy(asc(toolAliases.alias)),
    ]);

    const byId = new Map(toolRows.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      if (!row) return [];
      return [
        {
          id: row.id,
          name: row.name,
          // Unknown categories (e.g. written by a newer version) degrade to OTHER.
          category: ToolCategorySchema.catch('OTHER').parse(row.category),
          isCustom: row.seedSlug === null,
          aliases: aliasRows
            .filter((alias) => alias.toolId === id && alias.alias !== row.name)
            .map((alias) => alias.alias),
        },
      ];
    });
  }
}
