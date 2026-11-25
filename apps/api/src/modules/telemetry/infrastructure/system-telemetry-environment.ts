import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../platform/config/app-config.js';
import { TelemetryEnvironment } from '../application/telemetry.ports.js';

@Injectable()
export class SystemTelemetryEnvironment extends TelemetryEnvironment {
  readonly appVersion: string;
  readonly receiverUrl: string | null;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super();
    this.appVersion = config.appVersion;
    this.receiverUrl = config.telemetryUrl;
  }

  now(): Date {
    return new Date();
  }

  newInstallId(): string {
    return randomUUID();
  }
}
