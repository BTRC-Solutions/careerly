import {
  type AiStatus,
  type AiUsageQuery,
  AiUsageQuerySchema,
  type AiUsageResponse,
} from '@careerly/contracts';
import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { monthOf } from '../application/ai-usage.js';
import { AiUsageService } from '../application/ai-usage.service.js';

/** AI usage (RF-CONF-06) and availability (RNF-13), for the interface. */
@Controller('ai')
export class AiController {
  constructor(private readonly usage: AiUsageService) {}

  @Get('usage')
  getUsage(
    @Query(new ZodValidationPipe(AiUsageQuerySchema)) query: AiUsageQuery,
  ): Promise<AiUsageResponse> {
    return this.usage.usage(query.month ?? monthOf(new Date()));
  }

  @Get('status')
  getStatus(): Promise<AiStatus> {
    return this.usage.status();
  }
}
