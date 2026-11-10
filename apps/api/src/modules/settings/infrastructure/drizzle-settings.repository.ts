import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { settings } from '../../../platform/database/schema.js';
import { SettingsRepository, type StoredSetting } from '../application/settings.repository.js';

@Injectable()
export class DrizzleSettingsRepository extends SettingsRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async findAll(): Promise<StoredSetting[]> {
    const rows = await this.database.db.select().from(settings);
    return rows.flatMap((row) => {
      try {
        return [{ key: row.key, value: JSON.parse(row.value) as unknown }];
      } catch {
        return [];
      }
    });
  }

  async upsertMany(entries: StoredSetting[]): Promise<void> {
    if (entries.length === 0) return;
    const updatedAt = new Date().toISOString();
    await this.database.db
      .insert(settings)
      .values(entries.map(({ key, value }) => ({ key, value: JSON.stringify(value), updatedAt })))
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: sql`excluded.value`, updatedAt: sql`excluded.updated_at` },
      });
  }
}
