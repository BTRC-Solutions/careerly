import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/index.js';
import { ApplicationTracksReader } from './application/dashboard.ports.js';
import { DashboardService } from './application/dashboard.service.js';
import { DashboardController } from './http/dashboard.controller.js';
import { ApplicationsModuleReader } from './infrastructure/applications-module-reader.js';

/** Aggregated reads for the home screen (ARCHITECTURE §4–5): metrics of applications (roadmap 8.1). */
@Module({
  imports: [ApplicationsModule],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    { provide: ApplicationTracksReader, useClass: ApplicationsModuleReader },
  ],
})
export class DashboardModule {}
