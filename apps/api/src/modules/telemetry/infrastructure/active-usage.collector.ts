import type { TelemetryMetricsV1 } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { TelemetryActivityRepository, TelemetryCollector } from '../application/telemetry.ports.js';

/** "Uso activo" (RF-TEL-03a): whether the interface talked to the backend that day. */
@Injectable()
export class ActiveUsageCollector extends TelemetryCollector {
  readonly metric = 'activeUsage' as const;

  constructor(private readonly activity: TelemetryActivityRepository) {
    super();
  }

  async collect(day: string): Promise<TelemetryMetricsV1> {
    return (await this.activity.has(day)) ? { activeUsage: { active: true } } : {};
  }
}
