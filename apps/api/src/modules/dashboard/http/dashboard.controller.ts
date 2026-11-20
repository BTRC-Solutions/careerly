import {
  type DashboardSummary,
  type DashboardSummaryQuery,
  DashboardSummaryQuerySchema,
} from '@careerly/contracts';
import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { DashboardService } from '../application/dashboard.service.js';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(
    @Query(new ZodValidationPipe(DashboardSummaryQuerySchema)) query: DashboardSummaryQuery,
  ): Promise<DashboardSummary> {
    return this.dashboard.summary(query.period);
  }
}
