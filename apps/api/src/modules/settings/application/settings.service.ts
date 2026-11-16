import {
  type Preferences,
  PreferencesSchema,
  type UpdateSettingsRequest,
} from '@careerly/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { SettingsRepository, type StoredSetting } from './settings.repository.js';

/** Storage key of each preference in the `settings` table. */
const STORAGE_KEYS = {
  uiLanguage: 'ui.language',
  onboardingCompletedAt: 'ui.onboardingCompletedAt',
} as const satisfies Record<keyof Preferences, string>;

/** Value used when a preference was never set (or its stored value is no longer valid). */
const DEFAULTS: Preferences = {
  uiLanguage: null,
  onboardingCompletedAt: null,
};

const PREFERENCE_NAMES = Object.keys(STORAGE_KEYS) as (keyof Preferences)[];

/** Reads and updates the non-secret user preferences (RF-CONF-08). */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly repository: SettingsRepository) {}

  async getPreferences(): Promise<Preferences> {
    const stored = new Map((await this.repository.findAll()).map((row) => [row.key, row.value]));
    const preferences = { ...DEFAULTS };

    for (const name of PREFERENCE_NAMES) {
      const key = STORAGE_KEYS[name];
      if (!stored.has(key)) continue;

      const parsed = PreferencesSchema.shape[name].safeParse(stored.get(key));
      if (parsed.success) {
        // Validated with this preference's own schema, so the value matches its type.
        Object.assign(preferences, { [name]: parsed.data });
      } else {
        // E.g. a value written by a newer version. Fall back to the default; never log the value.
        this.logger.warn(`Ignoring invalid stored value for setting "${key}".`);
      }
    }
    return preferences;
  }

  async updatePreferences(patch: UpdateSettingsRequest): Promise<Preferences> {
    const changes: StoredSetting[] = PREFERENCE_NAMES.filter((name) => name in patch).map(
      (name) => ({ key: STORAGE_KEYS[name], value: patch[name] }),
    );
    await this.repository.upsertMany(changes);
    return this.getPreferences();
  }

  /**
   * Values another module keeps under its own `<namespace>.` prefix (e.g. `telemetry.`), keyed without
   * the prefix. Only valid JSON values are returned; validating them is the caller's job.
   */
  async getNamespace(namespace: string): Promise<Map<string, unknown>> {
    const prefix = namespacePrefix(namespace);
    return new Map(
      (await this.repository.findAll())
        .filter((row) => row.key.startsWith(prefix))
        .map((row) => [row.key.slice(prefix.length), row.value]),
    );
  }

  /** Writes (`value` defined) or deletes (`undefined`) keys of a namespace, all at once. */
  async updateNamespace(namespace: string, changes: Record<string, unknown>): Promise<void> {
    const prefix = namespacePrefix(namespace);
    const entries = Object.entries(changes);
    await this.repository.upsertMany(
      entries
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => ({ key: prefix + key, value })),
    );
    await this.repository.deleteMany(
      entries.filter(([, value]) => value === undefined).map(([key]) => prefix + key),
    );
  }
}

/** Namespaces cannot touch the user preferences (`ui.*`). */
function namespacePrefix(namespace: string): string {
  if (!/^[a-z]+$/.test(namespace) || namespace === 'ui') {
    throw new Error(`Invalid settings namespace "${namespace}".`);
  }
  return `${namespace}.`;
}
