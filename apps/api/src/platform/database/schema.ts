import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
