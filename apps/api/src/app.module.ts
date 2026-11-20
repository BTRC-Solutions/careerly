import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ApplicationsModule } from './modules/applications/index.js';
import { AiModule } from './modules/ai/index.js';
import { DashboardModule } from './modules/dashboard/index.js';
import { DocumentsModule } from './modules/documents/index.js';
import { JobPostingsModule } from './modules/job-postings/index.js';
import { JobsModule } from './modules/jobs/index.js';
import { ProfileModule } from './modules/profile/index.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { TailoringModule } from './modules/tailoring/index.js';
import { TelemetryModule } from './modules/telemetry/index.js';
import { APP_CONFIG, type AppConfig } from './platform/config/app-config.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { HealthController } from './platform/health/health.controller.js';
import { ApiExceptionFilter } from './platform/http/api-exception.filter.js';

/** Makes the validated configuration injectable everywhere. */
@Global()
@Module({})
class ConfigModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.register(config),
        DatabaseModule,
        JobsModule,
        SettingsModule,
        ProfileModule,
        JobPostingsModule,
        AiModule,
        DocumentsModule,
        TailoringModule,
        ApplicationsModule,
        DashboardModule,
        TelemetryModule,
      ],
      controllers: [HealthController],
      providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
    };
  }
}
