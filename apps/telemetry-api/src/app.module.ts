import { type DynamicModule, Module } from '@nestjs/common';
import { APP_DEPS, type AppDeps } from './deps.js';
import { HealthController } from './health.controller.js';
import { IngestController } from './ingest/ingest.controller.js';
import { IngestService } from './ingest/ingest.service.js';
import { IpLimits } from './ingest/ip-limits.js';
import { ReportsRepository } from './ingest/reports.repository.js';
import { StatsController } from './stats/stats.controller.js';
import { StatsService } from './stats/stats.service.js';

@Module({})
export class AppModule {
  static register(deps: AppDeps): DynamicModule {
    return {
      module: AppModule,
      controllers: [IngestController, StatsController, HealthController],
      providers: [
        { provide: APP_DEPS, useValue: deps },
        { provide: IpLimits, useFactory: () => new IpLimits(deps.config, deps.now) },
        ReportsRepository,
        IngestService,
        StatsService,
      ],
    };
  }
}
