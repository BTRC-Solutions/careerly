/** A stored preference: its storage key and its already-decoded JSON value. */
export interface StoredSetting {
  key: string;
  value: unknown;
}

/**
 * Persistence port for the `settings` key/value table.
 * Declared as an abstract class so it can be used as a Nest DI token.
 */
export abstract class SettingsRepository {
  /** Every stored setting. Values that are not valid JSON are skipped. */
  abstract findAll(): Promise<StoredSetting[]>;

  /** Inserts or replaces the given settings in a single statement (all or nothing). */
  abstract upsertMany(settings: StoredSetting[]): Promise<void>;
}
