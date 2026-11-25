import { TelemetryMetricIdSchema } from '@careerly/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { SettingsService } from '../../settings/index.js';
import { TelemetryPreferencesStore } from '../application/telemetry.ports.js';
import { NO_PREFERENCES, type TelemetryPreferences } from '../domain/telemetry-consent.js';

const NAMESPACE = 'telemetry';

const StoredSchema = z.object({
  consentVersion: z.number().int().min(0),
  metrics: z.partialRecord(TelemetryMetricIdSchema, z.boolean()),
  installId: z.uuid().nullable(),
  registeredKey: z.string().nullable(),
  lastSentDay: z.iso.date().nullable(),
});

/**
 * Keeps the telemetry choices in `settings` (keys `telemetry.consentVersion`, `.metrics`, `.installId`) and the
 * sending state (`.registeredKey`, `.lastSentDay`).
 */
@Injectable()
export class SettingsTelemetryPreferencesStore extends TelemetryPreferencesStore {
  private readonly logger = new Logger(SettingsTelemetryPreferencesStore.name);

  constructor(private readonly settings: SettingsService) {
    super();
  }

  async load(): Promise<TelemetryPreferences> {
    const values = await this.settings.getNamespace(NAMESPACE);
    const parsed = StoredSchema.safeParse({
      consentVersion: values.get('consentVersion') ?? 0,
      metrics: values.get('metrics') ?? {},
      installId: values.get('installId') ?? null,
      registeredKey: values.get('registeredKey') ?? null,
      lastSentDay: values.get('lastSentDay') ?? null,
    });
    if (!parsed.success) {
      // Never guess consent from corrupted data: ask again (RN-19).
      this.logger.warn('Ignoring invalid stored telemetry preferences.');
      return NO_PREFERENCES;
    }
    return parsed.data;
  }

  async save(prefs: TelemetryPreferences): Promise<void> {
    await this.settings.updateNamespace(NAMESPACE, {
      consentVersion: prefs.consentVersion,
      metrics: prefs.metrics,
      installId: prefs.installId ?? undefined,
      registeredKey: prefs.registeredKey ?? undefined,
      lastSentDay: prefs.lastSentDay ?? undefined,
    });
  }
}
