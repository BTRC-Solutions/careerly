import type { DatabaseSync } from 'node:sqlite';
import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { createDrizzle, type AppDatabase } from './drizzle.js';
import { countAppliedMigrations, migrateDatabase } from './migrator.js';
import { openDatabase } from './sqlite.js';

/**
 * Owns the single SQLite connection of the app. Migrations run before the connection
 * is handed to the rest of the app (see `DatabaseModule`).
 *
 * The connection can be swapped at runtime (restore and data deletion, RF-CONF-04/05): always read
 * `connection` and `db` at call time instead of keeping a reference.
 */
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly replacedListeners: (() => void)[] = [];
  #connection: DatabaseSync;
  #db: AppDatabase;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.#connection = this.migrateAndOpen();
    this.#db = createDrizzle(this.#connection);
  }

  get connection(): DatabaseSync {
    return this.#connection;
  }

  get db(): AppDatabase {
    return this.#db;
  }

  appliedMigrations(): number {
    return countAppliedMigrations(this.#connection);
  }

  /** Registers a callback that runs after the database file is replaced (e.g. to re-seed data). */
  onReplaced(listener: () => void): void {
    this.replacedListeners.push(listener);
  }

  /**
   * Closes the connection, lets `swap` replace or delete the database file, then migrates and reopens it.
   * If `swap` or the migration fails, `rollback` runs before the error is rethrown and the database is
   * reopened, so the app keeps working with the previous data.
   */
  replace(swap: () => void, rollback: () => void): void {
    this.#connection.close();
    try {
      swap();
      this.#connection = this.migrateAndOpen();
    } catch (error) {
      rollback();
      this.#connection = this.migrateAndOpen();
      this.#db = createDrizzle(this.#connection);
      throw error;
    }
    this.#db = createDrizzle(this.#connection);
    for (const listener of this.replacedListeners) {
      listener();
    }
  }

  onApplicationShutdown() {
    if (this.#connection.isOpen) {
      this.#connection.close();
    }
  }

  private migrateAndOpen(): DatabaseSync {
    const result = migrateDatabase({
      databaseFile: this.config.databaseFile,
      migrationsDir: this.config.migrationsDir,
      backupsDir: this.config.backupsDir,
    });
    if (result.applied.length > 0) {
      this.logger.log(
        `Applied ${result.applied.length} migration(s)${result.backupFile ? ' after creating a backup' : ''}.`,
      );
    }
    return openDatabase(this.config.databaseFile);
  }
}
