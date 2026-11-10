import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

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

// ---------------------------------------------------------------------------
// Master profile (owned by the `profile` module; RF-PROF-01 to RF-PROF-05, RF-PROF-07).
// Dates are "YYYY-MM" strings; timestamps are ISO strings.
// ---------------------------------------------------------------------------

/** Origin and timestamps shared by every element of the profile (RF-PROF-07). */
const provenance = () => ({
  /** `MANUAL`, `IMPORT` or `GAP_ANSWER`. */
  origin: text('origin').notNull().default('MANUAL'),
  /** Tailoring session that created the element (`GAP_ANSWER`). No FK yet: sessions arrive in F5. */
  originSessionId: text('origin_session_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/** Personal information: a single row (`id = 1`). There is only one user and one profile. */
export const profilePersonalInfo = sqliteTable(
  'profile_personal_info',
  {
    id: integer('id').primaryKey(),
    fullName: text('full_name'),
    headline: text('headline'),
    location: text('location'),
    email: text('email'),
    phone: text('phone'),
    summary: text('summary'),
    /** JSON array of `ProfileLink`, validated with Zod. */
    links: text('links').notNull().default('[]'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [check('profile_personal_info_single_row', sql`${table.id} = 1`)],
);

export const positions = sqliteTable('positions', {
  id: text('id').primaryKey(),
  company: text('company').notNull(),
  title: text('title').notNull(),
  location: text('location'),
  workMode: text('work_mode'),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  context: text('context'),
  ...provenance(),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  role: text('role'),
  url: text('url'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  description: text('description'),
  ...provenance(),
});

/** Belongs to exactly one position or one project; `sort_order` is the user's order inside it. */
export const achievements = sqliteTable(
  'achievements',
  {
    id: text('id').primaryKey(),
    positionId: text('position_id').references(() => positions.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    metrics: text('metrics'),
    sortOrder: integer('sort_order').notNull(),
    ...provenance(),
  },
  (table) => [
    check(
      'achievements_single_parent',
      sql`(${table.positionId} IS NULL) <> (${table.projectId} IS NULL)`,
    ),
    index('achievements_position_id_idx').on(table.positionId, table.sortOrder),
    index('achievements_project_id_idx').on(table.projectId, table.sortOrder),
  ],
);

/** Link from a profile element to a catalog tool. Tools cannot be deleted while referenced. */
const toolLink = (ownerColumn: string, owner: () => AnySQLiteColumn) => ({
  ownerId: text(ownerColumn).notNull().references(owner, { onDelete: 'cascade' }),
  toolId: text('tool_id')
    .notNull()
    .references(() => tools.id),
});

export const positionTools = sqliteTable(
  'position_tools',
  toolLink('position_id', () => positions.id),
  (table) => [
    primaryKey({ columns: [table.ownerId, table.toolId] }),
    index('position_tools_tool_id_idx').on(table.toolId),
  ],
);

export const projectTools = sqliteTable(
  'project_tools',
  toolLink('project_id', () => projects.id),
  (table) => [
    primaryKey({ columns: [table.ownerId, table.toolId] }),
    index('project_tools_tool_id_idx').on(table.toolId),
  ],
);

export const achievementTools = sqliteTable(
  'achievement_tools',
  toolLink('achievement_id', () => achievements.id),
  (table) => [
    primaryKey({ columns: [table.ownerId, table.toolId] }),
    index('achievement_tools_tool_id_idx').on(table.toolId),
  ],
);

export const education = sqliteTable('education', {
  id: text('id').primaryKey(),
  institution: text('institution').notNull(),
  title: text('title').notNull(),
  kind: text('kind').notNull(),
  field: text('field'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  description: text('description'),
  ...provenance(),
});

export const certifications = sqliteTable('certifications', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  issuer: text('issuer'),
  issueDate: text('issue_date'),
  expirationDate: text('expiration_date'),
  credentialId: text('credential_id'),
  url: text('url'),
  ...provenance(),
});

export const languageSkills = sqliteTable('language_skills', {
  id: text('id').primaryKey(),
  language: text('language').notNull(),
  level: text('level').notNull(),
  notes: text('notes'),
  ...provenance(),
});
