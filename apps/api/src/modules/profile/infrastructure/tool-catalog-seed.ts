import { ToolCategorySchema } from '@careerly/contracts';
import { z } from 'zod';
import seedJson from './tool-catalog.seed.json' with { type: 'json' };

/** One tool of the catalog shipped with the app. `slug` is stable across versions; never rename it. */
export const SeedToolSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(1),
  category: ToolCategorySchema,
  aliases: z.array(z.string().min(1)),
});
export type SeedTool = z.infer<typeof SeedToolSchema>;

/** The catalog shipped with the app (validated when first loaded). */
export function loadToolCatalogSeed(): SeedTool[] {
  return z.array(SeedToolSchema).parse(seedJson);
}
