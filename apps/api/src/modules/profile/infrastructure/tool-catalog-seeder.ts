import type { DatabaseSync } from 'node:sqlite';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { inTransaction } from '../../../platform/database/sqlite.js';
import { normalizeToolName } from '../domain/tool-name.js';
import { loadToolCatalogSeed, type SeedTool } from './tool-catalog-seed.js';

export interface SeedSyncResult {
  inserted: number;
  /** User tools that a new seed tool took over (same name or alias), keeping their id. */
  adopted: number;
  updated: number;
  aliasesAdded: number;
  /** Seed aliases skipped because another tool already owns them. */
  conflicts: number;
}

/**
 * Brings the catalog in the database up to date with the seed shipped with the app.
 * Idempotent; runs on every start inside one transaction.
 *
 * - Seed tools are matched by `seed_slug`; new ones are inserted with `id = slug`.
 * - If a user tool already has the name or an alias of a new seed tool, it is adopted
 *   (it becomes the seed tool and keeps its id, so references to it stay valid).
 * - Aliases are only added, never removed or moved: an alias owned by another tool is skipped.
 * - User tools are otherwise never modified.
 */
export function syncToolCatalog(
  connection: DatabaseSync,
  seed: SeedTool[],
  now: () => Date = () => new Date(),
): SeedSyncResult {
  const result: SeedSyncResult = {
    inserted: 0,
    adopted: 0,
    updated: 0,
    aliasesAdded: 0,
    conflicts: 0,
  };

  const findBySlug = connection.prepare('SELECT id, name, category FROM tools WHERE seed_slug = ?');
  const findAliasOwner = connection.prepare(
    'SELECT a.tool_id AS toolId, t.seed_slug AS seedSlug FROM tool_aliases a JOIN tools t ON t.id = a.tool_id WHERE a.normalized = ?',
  );
  const insertTool = connection.prepare(
    'INSERT INTO tools (id, seed_slug, name, category, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const updateTool = connection.prepare(
    'UPDATE tools SET seed_slug = ?, name = ?, category = ? WHERE id = ?',
  );
  const insertAlias = connection.prepare(
    'INSERT INTO tool_aliases (normalized, alias, tool_id) VALUES (?, ?, ?)',
  );

  inTransaction(connection, () => {
    for (const tool of seed) {
      const names = [tool.name, ...tool.aliases]
        .map((alias) => ({ alias, normalized: normalizeToolName(alias) }))
        .filter((entry) => entry.normalized);

      let id: string;
      const existing = findBySlug.get(tool.slug);
      if (existing) {
        id = String(existing.id);
        if (existing.name !== tool.name || existing.category !== tool.category) {
          updateTool.run(tool.slug, tool.name, tool.category, id);
          result.updated++;
        }
      } else {
        const userTool = names
          .map((entry) => findAliasOwner.get(entry.normalized))
          .find((owner) => owner && owner.seedSlug === null);
        if (userTool) {
          id = String(userTool.toolId);
          updateTool.run(tool.slug, tool.name, tool.category, id);
          result.adopted++;
        } else {
          id = tool.slug;
          insertTool.run(id, tool.slug, tool.name, tool.category, now().toISOString());
          result.inserted++;
        }
      }

      for (const { alias, normalized } of names) {
        const owner = findAliasOwner.get(normalized);
        if (!owner) {
          insertAlias.run(normalized, alias, id);
          result.aliasesAdded++;
        } else if (owner.toolId !== id) {
          result.conflicts++;
        }
      }
    }
  });

  return result;
}

/** Syncs the shipped catalog when the API starts (before it accepts requests). */
@Injectable()
export class ToolCatalogSeeder implements OnModuleInit {
  private readonly logger = new Logger(ToolCatalogSeeder.name);

  constructor(private readonly database: DatabaseService) {}

  onModuleInit() {
    const result = syncToolCatalog(this.database.connection, loadToolCatalogSeed());
    if (result.inserted + result.adopted + result.updated + result.aliasesAdded > 0) {
      this.logger.log(
        `Tool catalog synced: ${result.inserted} new, ${result.adopted} adopted, ${result.updated} updated, ${result.aliasesAdded} aliases added.`,
      );
    }
    if (result.conflicts > 0) {
      this.logger.warn(
        `Tool catalog: ${result.conflicts} seed alias(es) already belong to other tools.`,
      );
    }
  }
}
