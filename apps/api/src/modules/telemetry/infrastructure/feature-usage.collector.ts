import type { TelemetryMetricsV1 } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { AiUsageService } from '../../ai/index.js';
import { TailoringUsageService } from '../../tailoring/index.js';
import { TelemetryCollector } from '../application/telemetry.ports.js';
import { dayRange } from '../domain/telemetry-report.js';

/**
 * "Uso de funciones" (RF-TEL-03h): the CVs generated that day and their languages, the gaps answered (through
 * the tailoring module) and the AI tokens (through the ai module). Only counts: never the CV, the answers or the
 * job description (RN-18). A day without any use of these functions does not report the metric.
 */
@Injectable()
export class FeatureUsageCollector extends TelemetryCollector {
  readonly metric = 'features' as const;

  constructor(
    private readonly ai: AiUsageService,
    private readonly tailoring: TailoringUsageService,
  ) {
    super();
  }

  async collect(day: string): Promise<TelemetryMetricsV1> {
    const { from, to } = dayRange(day);
    const [aiTokens, usage] = await Promise.all([
      this.ai.tokensOn(day),
      this.tailoring.usageBetween(from, to),
    ]);
    if (aiTokens === 0 && usage.resumesGenerated === 0 && usage.gapsAnswered === 0) return {};
    return { features: { ...usage, aiTokens } };
  }
}
