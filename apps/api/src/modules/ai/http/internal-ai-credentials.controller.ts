import { type AiCredentials, AiCredentialsSchema } from '@careerly/contracts';
import { Body, Controller, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { AiCredentialsStore } from '../application/ai-credentials.store.js';
import { ControlTokenGuard } from './control-token.guard.js';

/**
 * Receives the active AI API key from the Electron main process (ADR-19).
 * Write-only: there is no route that returns the key.
 */
@Controller('internal/ai-credentials')
@UseGuards(ControlTokenGuard)
export class InternalAiCredentialsController {
  constructor(private readonly store: AiCredentialsStore) {}

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  set(@Body(new ZodValidationPipe(AiCredentialsSchema)) body: AiCredentials): void {
    this.store.set(body.credentials);
  }
}
