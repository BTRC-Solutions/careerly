import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Database schema (source for `npm run db:generate -w @careerly/api`).
 * Each module adds its tables here as the roadmap progresses.
 */

/** Non-secret preferences (`Setting` in ARCHITECTURE.md). The AI API key is never stored here. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  /** JSON-encoded value, validated with Zod by the module that owns the key. */
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/**
 * Tool catalog (`Tool` in ARCHITECTURE.md, RF-PROF-06). Owned by the `profile` module.
 * Seed tools have a stable `seedSlug`; tools created by the user have none.
 */
export const tools = sqliteTable('tools', {
  id: text('id').primaryKey(),
  seedSlug: text('seed_slug').unique(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  createdAt: text('created_at').notNull(),
});

/**
 * Synonyms of a tool (`ToolAlias`). The canonical name is stored here too, so every lookup
 * goes through `normalized`, which is unique: a name resolves to at most one tool.
 */
export const toolAliases = sqliteTable(
  'tool_aliases',
  {
    normalized: text('normalized').primaryKey(),
    /** As written, for display. */
    alias: text('alias').notNull(),
    toolId: text('tool_id')
      .notNull()
      .references(() => tools.id, { onDelete: 'cascade' }),
  },
  (table) => [index('tool_aliases_tool_id_idx').on(table.toolId)],
);
