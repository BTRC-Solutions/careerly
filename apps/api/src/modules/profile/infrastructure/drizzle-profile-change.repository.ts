import { Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { profileChanges } from '../../../platform/database/schema.js';
import { ProfileChangeRepository } from '../application/profile.repositories.js';
import type { ProfileChange } from '../domain/profile-changes.js';

const EntitySchema = z.enum(['position', 'project', 'achievement']);
const FieldValuesSchema = z.record(z.string(), z.unknown());

type Row = typeof profileChanges.$inferSelect;

@Injectable()
export class DrizzleProfileChangeRepository extends ProfileChangeRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  private get db() {
    return this.database.db;
  }

  async insert(change: ProfileChange) {
    const update =
      change.kind === 'UPDATE'
        ? {
            before: JSON.stringify(change.before),
            after: JSON.stringify(change.after),
            previousUpdatedAt: change.previousUpdatedAt,
            resultUpdatedAt: change.resultUpdatedAt,
          }
        : {};
    await this.db.insert(profileChanges).values({
      id: change.id,
      sessionId: change.sessionId,
      entity: change.entity,
      entityId: change.entityId,
      kind: change.kind,
      createdAt: change.createdAt,
      revertedAt: change.revertedAt,
      ...update,
    });
  }

  async listBySession(sessionId: string): Promise<ProfileChange[]> {
    const rows = await this.db
      .select()
      .from(profileChanges)
      .where(eq(profileChanges.sessionId, sessionId))
      .orderBy(asc(profileChanges.createdAt));
    return rows.flatMap((row) => toChange(row) ?? []);
  }

  async markReverted(ids: string[], at: string) {
    if (ids.length === 0) return;
    await this.db
      .update(profileChanges)
      .set({ revertedAt: at })
      .where(inArray(profileChanges.id, ids));
  }
}

/** A row this version cannot read (e.g. written by a newer one) is left out rather than guessed. */
function toChange(row: Row): ProfileChange | undefined {
  const entity = EntitySchema.safeParse(row.entity);
  if (!entity.success) return undefined;
  const base = {
    id: row.id,
    sessionId: row.sessionId,
    entity: entity.data,
    entityId: row.entityId,
    createdAt: row.createdAt,
    revertedAt: row.revertedAt,
  };
  if (row.kind === 'CREATE') return { ...base, kind: 'CREATE' };

  const before = FieldValuesSchema.safeParse(parseJson(row.before));
  const after = FieldValuesSchema.safeParse(parseJson(row.after));
  if (row.kind !== 'UPDATE' || !before.success || !after.success) return undefined;
  if (!row.previousUpdatedAt || !row.resultUpdatedAt) return undefined;
  return {
    ...base,
    kind: 'UPDATE',
    before: before.data,
    after: after.data,
    previousUpdatedAt: row.previousUpdatedAt,
    resultUpdatedAt: row.resultUpdatedAt,
  };
}

function parseJson(text: string | null): unknown {
  try {
    return text === null ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}
