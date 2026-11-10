import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthResponse } from '@careerly/contracts';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { DatabaseService } from '../database/database.service.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly database: DatabaseService,
  ) {}

  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      version: this.config.appVersion,
      database: { status: 'ok', appliedMigrations: this.database.appliedMigrations() },
    };
  }
}
