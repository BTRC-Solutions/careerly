import { z } from 'zod';

/** Category of a catalog tool (RF-PROF-06). */
export const ToolCategorySchema = z.enum([
  'LANGUAGE',
  'FRAMEWORK',
  'LIBRARY',
  'DATABASE',
  'CLOUD',
  'DEVOPS',
  'TOOL',
  'METHODOLOGY',
  'OTHER',
]);
export type ToolCategory = z.infer<typeof ToolCategorySchema>;

/** A tool from the normalized catalog: shipped with the app (seed) or created by the user. */
export const ToolSchema = z.object({
  id: z.string(),
  /** Canonical display name, e.g. "PostgreSQL". */
  name: z.string(),
  category: ToolCategorySchema,
  /** `true` for tools created by the user, `false` for the catalog shipped with the app. */
  isCustom: z.boolean(),
  /** Synonyms that resolve to this tool, e.g. ["Postgres", "psql"]. Excludes `name`. */
  aliases: z.array(z.string()),
});
export type Tool = z.infer<typeof ToolSchema>;

/** Maximum length of a tool name or search query. */
export const TOOL_NAME_MAX_LENGTH = 80;

/** `GET /tools?query=&limit=` query string. Without `query`, lists tools alphabetically. */
export const SearchToolsQuerySchema = z.object({
  query: z.string().trim().max(TOOL_NAME_MAX_LENGTH).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchToolsQuery = z.infer<typeof SearchToolsQuerySchema>;

/** `GET /tools` response: best matches first (exact alias, then prefix, then substring). */
export const SearchToolsResponseSchema = z.object({
  items: z.array(ToolSchema),
});
export type SearchToolsResponse = z.infer<typeof SearchToolsResponseSchema>;

/** `POST /tools` body. */
export const CreateToolRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(TOOL_NAME_MAX_LENGTH),
    category: ToolCategorySchema.default('OTHER'),
  })
  .strict();
export type CreateToolRequest = z.infer<typeof CreateToolRequestSchema>;

/**
 * `POST /tools` response. If the name already resolves to a tool (by name or alias),
 * that tool is returned with `created: false` (HTTP 200) instead of creating a duplicate.
 */
export const CreateToolResponseSchema = z.object({
  tool: ToolSchema,
  created: z.boolean(),
});
export type CreateToolResponse = z.infer<typeof CreateToolResponseSchema>;
