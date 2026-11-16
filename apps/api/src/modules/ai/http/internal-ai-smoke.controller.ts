import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { AiSmokeTestService, type SmokeTestResult } from '../application/smoke-test.service.js';
import { ControlTokenGuard } from './control-token.guard.js';

const SmokeRequestSchema = z
  .object({
    model: z
      .string()
      .regex(/^[a-z0-9.-]{1,80}$/)
      .optional(),
  })
  .strict()
  .default({});

/**
 * `POST /internal/ai/smoke`: one tiny structured call with the active key (Electron main and
 * development scripts only, control token). Returns usage numbers, never content.
 */
@Controller('internal/ai')
@UseGuards(ControlTokenGuard)
export class InternalAiSmokeController {
  constructor(private readonly smoke: AiSmokeTestService) {}

  @Post('smoke')
  @HttpCode(HttpStatus.OK)
  run(
    @Body(new ZodValidationPipe(SmokeRequestSchema)) body: z.infer<typeof SmokeRequestSchema>,
  ): Promise<SmokeTestResult> {
    return this.smoke.run(body.model);
  }

  /** `GET /internal/ai/models`: model names available to the active key (no content). */
  @Get('models')
  models(): Promise<{ provider: string; models: string[] }> {
    return this.smoke.availableModels();
  }
}
