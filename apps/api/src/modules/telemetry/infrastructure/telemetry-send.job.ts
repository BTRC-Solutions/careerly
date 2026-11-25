import { Injectable, type OnModuleInit } from '@nestjs/common';
import { JobRunner, RetryLaterError } from '../../jobs/index.js';
import { TelemetrySender, TelemetrySendRetryableError } from '../application/telemetry-sender.js';
import { sendRetryDelayMs } from '../domain/telemetry-sending.js';

export const TELEMETRY_SEND_JOB = 'telemetry-send';

/**
 * Runs `telemetry-send` jobs, one a UTC day (ARCHITECTURE §19.2): without network, with `429` or `5xx` it tries
 * again after about 1 min, 5 min, 30 min and 2 h, never before `Retry-After`. A failure never reaches the rest
 * of the app (RN-21).
 */
@Injectable()
export class TelemetrySendJobHandler implements OnModuleInit {
  constructor(
    private readonly runner: JobRunner,
    private readonly sender: TelemetrySender,
  ) {}

  onModuleInit(): void {
    this.runner.register({
      type: TELEMETRY_SEND_JOB,
      run: async (_payload, context) => {
        try {
          await this.sender.send();
        } catch (error) {
          if (error instanceof TelemetrySendRetryableError) {
            throw new RetryLaterError(
              error.code,
              sendRetryDelayMs(context.attempt, error.retryAfterSeconds),
            );
          }
          throw error;
        }
      },
    });
  }
}
