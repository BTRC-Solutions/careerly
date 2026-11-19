import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ApplicationsModule } from '../applications/index.js';
import { JobPostingsModule } from '../job-postings/index.js';
import { SettingsModule } from '../settings/index.js';
import { TailoringModule } from '../tailoring/index.js';
import {
  TELEMETRY_COLLECTORS,
  TelemetryActivityRepository,
  type TelemetryCollector,
  TelemetryEnvironment,
  TelemetryPreferencesStore,
  TelemetryReportRepository,
} from './application/telemetry.ports.js';
import { TelemetryService } from './application/telemetry.service.js';
import { TelemetryActivityInterceptor } from './http/telemetry-activity.interceptor.js';
import { TelemetryController } from './http/telemetry.controller.js';
import { ActiveUsageCollector } from './infrastructure/active-usage.collector.js';
import {
  APPLICATION_COLLECTORS,
  ApplicationsDayReader,
} from './infrastructure/application-metrics.collectors.js';
import { FeatureUsageCollector } from './infrastructure/feature-usage.collector.js';
import {
  DrizzleTelemetryActivityRepository,
  DrizzleTelemetryReportRepository,
} from './infrastructure/drizzle-telemetry.repositories.js';
import { SettingsTelemetryPreferencesStore } from './infrastructure/settings-telemetry-preferences.store.js';
import { SystemTelemetryEnvironment } from './infrastructure/system-telemetry-environment.js';
import { TelemetryScheduler } from './infrastructure/telemetry-scheduler.js';

/**
 * Usage telemetry with per-metric consent (ARCHITECTURE §19.2). Never the CV, the profile or personal
 * data. Step 1.5: consent, anonymous id, "active usage" and local reports; step 4.9: AI tokens in
 * "uso de funciones", completed in step 6.9 with CVs, languages and gaps; step 7.7: the application metrics
 * (created, portal, category and seniority, title, funnel, work mode and country). Sending comes in step 8.8.
 */
@Module({
  imports: [SettingsModule, TailoringModule, ApplicationsModule, JobPostingsModule],
  controllers: [TelemetryController],
  providers: [
    TelemetryService,
    TelemetryScheduler,
    ActiveUsageCollector,
    FeatureUsageCollector,
    ApplicationsDayReader,
    ...APPLICATION_COLLECTORS,
    { provide: TelemetryPreferencesStore, useClass: SettingsTelemetryPreferencesStore },
    { provide: TelemetryReportRepository, useClass: DrizzleTelemetryReportRepository },
    { provide: TelemetryActivityRepository, useClass: DrizzleTelemetryActivityRepository },
    { provide: TelemetryEnvironment, useClass: SystemTelemetryEnvironment },
    {
      provide: TELEMETRY_COLLECTORS,
      useFactory: (...collectors: TelemetryCollector[]) => collectors,
      inject: [ActiveUsageCollector, ...APPLICATION_COLLECTORS, FeatureUsageCollector],
    },
    { provide: APP_INTERCEPTOR, useClass: TelemetryActivityInterceptor },
  ],
})
export class TelemetryModule {}
