import { type TelemetrySecret, TelemetrySecretSchema } from '@careerly/contracts';
import { Body, Controller, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { ControlTokenGuard } from '../../../platform/http/control-token.guard.js';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { TelemetrySecretStore } from '../application/telemetry-secret.store.js';

/**
 * Receives the secret the signing keys come from (ADR-26) from Electron's main process. Write-only: no route
 * returns it.
 */
@Controller('internal/telemetry-secret')
@UseGuards(ControlTokenGuard)
export class InternalTelemetrySecretController {
  constructor(private readonly store: TelemetrySecretStore) {}

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  set(@Body(new ZodValidationPipe(TelemetrySecretSchema)) body: TelemetrySecret): void {
    this.store.set(body.secret);
  }
}
