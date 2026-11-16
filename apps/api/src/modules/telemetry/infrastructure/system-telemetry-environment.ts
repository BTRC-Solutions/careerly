import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../platform/config/app-config.js';
import { TelemetryEnvironment } from '../application/telemetry.ports.js';

@Injectable()
export class SystemTelemetryEnvironment extends TelemetryEnvironment {
  readonly appVersion: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super();
    this.appVersion = config.appVersion;
  }

  now(): Date {
    return new Date();
  }

  newInstallId(): string {
    return randomUUID();
  }
}
