import type { Tool, ToolCategory } from '@careerly/contracts';

export interface NewTool {
  name: string;
  category: ToolCategory;
  /** Lookup key of `name` (see `normalizeToolName`). */
  normalized: string;
}

/**
 * Persistence port for the tool catalog (`tools` + `tool_aliases`).
 * Declared as an abstract class so it can be used as a Nest DI token.
 */
export abstract class ToolRepository {
  /**
   * Tools whose name or an alias contains `normalizedQuery`, best matches first:
   * exact alias, then prefix, then substring. Without a query, tools in alphabetical order.
   */
  abstract search(normalizedQuery: string | undefined, limit: number): Promise<Tool[]>;

  abstract findById(id: string): Promise<Tool | undefined>;

  /** The tool that owns this normalized name or alias, if any. */
  abstract findByNormalizedAlias(normalized: string): Promise<Tool | undefined>;

  /** Creates a user tool and its canonical alias atomically. */
  abstract createCustom(tool: NewTool): Promise<Tool>;
}
