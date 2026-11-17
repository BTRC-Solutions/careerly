import type { TelemetryMetricsV1 } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { AiUsageService } from '../../ai/index.js';
import { TelemetryCollector } from '../application/telemetry.ports.js';

/**
 * "Uso de funciones" (RF-TEL-03h): today only the AI tokens of the day, read from `AiGeneration` through
 * the ai module. Generated CVs, their languages and answered gaps do not exist until phase 6, so they are 0
 * (the schema needs them). A day without any use of these functions does not report the metric.
 */
@Injectable()
export class FeatureUsageCollector extends TelemetryCollector {
  readonly metric = 'features' as const;

  constructor(private readonly ai: AiUsageService) {
    super();
  }

  async collect(day: string): Promise<TelemetryMetricsV1> {
    const aiTokens = await this.ai.tokensOn(day);
    if (aiTokens === 0) return {};
    return {
      features: { resumesGenerated: 0, outputLanguages: {}, gapsAnswered: 0, aiTokens },
    };
  }
}
