import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { TelemetryService } from '../application/telemetry.service.js';

/**
 * Marks the day as "used" whenever the interface calls the backend (RF-TEL-03a).
 * Fire and forget: it never delays or fails a request (RN-21).
 */
@Injectable()
export class TelemetryActivityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TelemetryActivityInterceptor.name);

  constructor(private readonly telemetry: TelemetryService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Electron's main process calls `/internal/*` on its own (e.g. to sync the AI key): not user activity.
    const url = context.switchToHttp().getRequest<{ path?: string }>().path ?? '';
    if (url.toLowerCase().startsWith('/internal')) return next.handle();

    this.telemetry.recordActivity().catch((error: unknown) => {
      this.logger.warn(
        `Activity was not recorded: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    });
    return next.handle();
  }
}
