import { ProfileOriginSchema } from '@careerly/contracts';
import type { BatchItem } from 'drizzle-orm/batch';
import type { z } from 'zod';

/** Provenance columns as stored, mapped to the contract fields (RF-PROF-07). */
export function provenanceOf(row: {
  origin: string;
  originSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    origin: ProfileOriginSchema.catch('MANUAL').parse(row.origin),
    originSessionId: row.originSessionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Reads an enum column; a value written by a newer version degrades to `fallback`. */
export function enumOf<T extends z.ZodType>(schema: T, value: unknown, fallback: z.infer<T>) {
  const parsed = schema.safeParse(value);
  return parsed.success ? (parsed.data as z.infer<T>) : fallback;
}

/** Drops keys whose value is `undefined`, so a PATCH only touches the fields that were sent. */
export function definedOnly<T extends object>(fields: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/** `db.batch()` needs a non-empty tuple. */
export function asBatch(items: BatchItem<'sqlite'>[]) {
  if (items.length === 0) throw new Error('Empty batch.');
  return items as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]];
}
