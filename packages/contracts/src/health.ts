import { z } from 'zod';

/** `GET /health` response. */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  database: z.object({
    status: z.literal('ok'),
    /** Number of migrations applied to the local database. */
    appliedMigrations: z.number().int().nonnegative(),
  }),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
