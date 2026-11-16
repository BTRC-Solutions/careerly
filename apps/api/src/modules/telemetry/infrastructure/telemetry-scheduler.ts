import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { TelemetryService } from '../application/telemetry.service.js';

const INTERVAL_MS = 60 * 60 * 1000;

/**
 * Builds the reports of closed days at startup and every hour, so a day is built soon after midnight
 * even if the app stays open. Moves to the `jobs` queue when it exists (step 4.3).
 * Failures are only logged: telemetry never affects the app (RN-21).
 */
@Injectable()
export class TelemetryScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TelemetryScheduler.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly telemetry: TelemetryService) {}

  /** Awaited by Nest, so the reports are ready before the API accepts requests. Never throws. */
  async onApplicationBootstrap() {
    await this.run();
    this.timer = setInterval(() => void this.run(), INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  private async run() {
    try {
      const built = await this.telemetry.buildPendingReports();
      if (built > 0) this.logger.log(`Built ${built} telemetry report(s).`);
    } catch (error) {
      this.logger.warn(
        `Telemetry reports were not built: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
