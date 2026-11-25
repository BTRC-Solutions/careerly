import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { JobQueue } from '../../jobs/index.js';
import { TelemetrySecretStore } from '../application/telemetry-secret.store.js';
import { TelemetrySender } from '../application/telemetry-sender.js';
import { TelemetryService } from '../application/telemetry.service.js';
import { SEND_ATTEMPTS_PER_DAY, utcDay } from '../domain/telemetry-sending.js';
import { TELEMETRY_SEND_JOB } from './telemetry-send.job.js';

const INTERVAL_MS = 60 * 60 * 1000;

/**
 * At startup and every hour: builds the reports of closed days, so a day is built soon after midnight even if
 * the app stays open, and queues that UTC day's send (one job a day, with its retries). Failures are only
 * logged: telemetry never affects the app (RN-21).
 */
@Injectable()
export class TelemetryScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TelemetryScheduler.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly telemetry: TelemetryService,
    private readonly sender: TelemetrySender,
    private readonly queue: JobQueue,
    secrets: TelemetrySecretStore,
  ) {
    // The secret arrives from Electron's main after the startup run.
    secrets.onChange(() => void this.run());
  }

  /** Awaited by Nest, so the reports are ready before the API accepts requests. Never throws. */
  async onApplicationBootstrap() {
    await this.run();
    this.timer = setInterval(() => void this.run(), INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  /** Never throws. */
  async run() {
    try {
      const built = await this.telemetry.buildPendingReports();
      if (built > 0) this.logger.log(`Built ${built} telemetry report(s).`);
      if (await this.sender.canSend()) {
        this.queue.enqueue({
          type: TELEMETRY_SEND_JOB,
          payload: null,
          dedupeKey: `${TELEMETRY_SEND_JOB}:${utcDay(new Date())}`,
          maxAttempts: SEND_ATTEMPTS_PER_DAY,
        });
      }
    } catch (error) {
      this.logger.warn(
        `Telemetry reports were not built or queued: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
