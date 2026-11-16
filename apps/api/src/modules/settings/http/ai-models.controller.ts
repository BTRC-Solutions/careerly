import {
  type AiModelsResponse,
  type UpdateAiModelRequest,
  UpdateAiModelRequestSchema,
} from '@careerly/contracts';
import {
  Body,
  type CallHandler,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Injectable,
  type NestInterceptor,
  Put,
  UseInterceptors,
} from '@nestjs/common';
import { catchError, type Observable, throwError } from 'rxjs';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { AiModelChoiceService } from '../application/ai-model-choice.service.js';
import { AiModelError, type AiModelFailure } from '../application/ai-models.ports.js';

/** HTTP status for each reason listing or trying models can fail (the API code is the reason). */
const STATUS: Record<AiModelFailure, number> = {
  AI_NOT_CONFIGURED: HttpStatus.CONFLICT,
  AI_KEY_REJECTED: HttpStatus.CONFLICT,
  AI_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  AI_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  AI_MODEL_UNAVAILABLE: HttpStatus.CONFLICT,
  AI_FAILED: HttpStatus.BAD_GATEWAY,
};

/** Maps `AiModelError` to HTTP errors (then shaped by `ApiExceptionFilter`). */
@Injectable()
class AiModelErrorsInterceptor implements NestInterceptor {
  intercept(_context: unknown, next: CallHandler): Observable<unknown> {
    return next
      .handle()
      .pipe(
        catchError((error: unknown) =>
          throwError(() =>
            error instanceof AiModelError
              ? new HttpException(
                  { code: error.reason, message: error.message },
                  STATUS[error.reason],
                )
              : error,
          ),
        ),
      );
  }
}

/** AI model choice per tier (RF-CONF-09). */
@Controller('settings/ai-models')
@UseInterceptors(AiModelErrorsInterceptor)
export class AiModelsController {
  constructor(private readonly models: AiModelChoiceService) {}

  /** Models the active key can use, with price and recommendation, and the choice per tier. */
  @Get()
  get(): Promise<AiModelsResponse> {
    return this.models.overview();
  }

  /** Tries the model with a minimal call and saves it; `model: null` goes back to the defaults. */
  @Put()
  update(
    @Body(new ZodValidationPipe(UpdateAiModelRequestSchema)) request: UpdateAiModelRequest,
  ): Promise<AiModelsResponse> {
    return this.models.choose(request);
  }
}
