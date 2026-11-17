import { z } from 'zod';

/*
 * Background jobs (ARCHITECTURE §10): long tasks (AI calls, renders) run in the backend's queue and survive
 * closing the app (RNF-13). The interface follows them with `GET /jobs/:id` and its event stream.
 */

/**
 * - `PENDING`: waiting to run (first time, or a retry after `runAt`).
 * - `RUNNING`: running now; back to `PENDING` if the app closes mid-way.
 * - `SUCCEEDED` / `FAILED`: finished; `FAILED` after the last attempt or a permanent error.
 */
export const JobStatusSchema = z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED']);
export type JobStatus = z.infer<typeof JobStatusSchema>;

/** Optional progress a running job reports (not persisted: after a restart it starts over). */
export const JobProgressSchema = z.object({
  /** Name of the current step, e.g. `matching`. */
  step: z.string().max(80).nullable(),
  done: z.number().int().nonnegative().nullable(),
  total: z.number().int().nonnegative().nullable(),
});
export type JobProgress = z.infer<typeof JobProgressSchema>;

/** `GET /jobs/:id`. */
export const JobViewSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: JobStatusSchema,
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  /** Error code of the last failure, e.g. `RATE_LIMITED`. */
  lastError: z.string().nullable(),
  progress: JobProgressSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
});
export type JobView = z.infer<typeof JobViewSchema>;

/**
 * `GET /jobs/:id/events` (server-sent events): the current state first (`state`), then what happens.
 * The stream ends after `succeeded` or `failed`.
 */
export const JobEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('state'), job: JobViewSchema }),
  z.object({ kind: z.literal('started'), jobId: z.string(), attempt: z.number().int() }),
  z.object({ kind: z.literal('progress'), jobId: z.string(), progress: JobProgressSchema }),
  z.object({
    kind: z.literal('retrying'),
    jobId: z.string(),
    error: z.string(),
    runAt: z.iso.datetime(),
  }),
  z.object({ kind: z.literal('succeeded'), jobId: z.string() }),
  z.object({ kind: z.literal('failed'), jobId: z.string(), error: z.string() }),
]);
export type JobEvent = z.infer<typeof JobEventSchema>;
