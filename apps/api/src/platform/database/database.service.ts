import type { DatabaseSync } from 'node:sqlite';
import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { createDrizzle, type AppDatabase } from './drizzle.js';
import { countAppliedMigrations, migrateDatabase } from './migrator.js';
import { openDatabase } from './sqlite.js';

/**
 * Owns the single SQLite connection of the app. Migrations run before the connection
 * is handed to the rest of the app (see `DatabaseModule`).
 */
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  readonly connection: DatabaseSync;
  readonly db: AppDatabase;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    const result = migrateDatabase({
      databaseFile: config.databaseFile,
      migrationsDir: config.migrationsDir,
      backupsDir: config.backupsDir,
    });
    if (result.applied.length > 0) {
      this.logger.log(
        `Applied ${result.applied.length} migration(s)${result.backupFile ? ' after creating a backup' : ''}.`,
      );
    }

    this.connection = openDatabase(config.databaseFile);
    this.db = createDrizzle(this.connection);
  }

  appliedMigrations(): number {
    return countAppliedMigrations(this.connection);
  }

  onApplicationShutdown() {
    if (this.connection.isOpen) {
      this.connection.close();
    }
  }
}
