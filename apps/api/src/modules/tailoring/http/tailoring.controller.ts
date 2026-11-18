import {
  type CreateTailoringSessionRequest,
  CreateTailoringSessionRequestSchema,
  type TailoringSessionView,
  type UpdateTailoringOptionsRequest,
  UpdateTailoringOptionsRequestSchema,
} from '@careerly/contracts';
import {
  BadRequestException,
  Body,
  type CallHandler,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  type NestInterceptor,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { catchError, type Observable, throwError } from 'rxjs';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { TailoringSessionsService } from '../application/tailoring-sessions.service.js';
import {
  JobDescriptionNotReadyError,
  TailoringJobPostingNotFoundError,
  TailoringSessionNotFoundError,
  TailoringTemplateNotFoundError,
} from '../application/tailoring.ports.js';
import {
  InvalidSessionTransitionError,
  TailoringSessionValidationError,
} from '../domain/tailoring-session.js';

/** Maps the module's errors to HTTP (then shaped by `ApiExceptionFilter`). */
@Injectable()
class TailoringErrorsInterceptor implements NestInterceptor {
  intercept(_context: unknown, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(catchError((error: unknown) => throwError(() => toHttpError(error))));
  }
}

function toHttpError(error: unknown): unknown {
  if (
    error instanceof TailoringSessionNotFoundError ||
    error instanceof TailoringJobPostingNotFoundError
  ) {
    return new NotFoundException(error.message);
  }
  if (
    error instanceof JobDescriptionNotReadyError ||
    error instanceof InvalidSessionTransitionError
  ) {
    return new ConflictException(error.message);
  }
  if (
    error instanceof TailoringSessionValidationError ||
    error instanceof TailoringTemplateNotFoundError
  ) {
    return new BadRequestException(error.message);
  }
  return error;
}

/** Tailoring sessions (RF-TAIL-01, RF-TAIL-02). */
@Controller('tailoring-sessions')
@UseInterceptors(TailoringErrorsInterceptor)
export class TailoringController {
  constructor(private readonly sessions: TailoringSessionsService) {}

  /** Starts a session and its match in the background; follow it with `GET /tailoring-sessions/:id`. */
  @Post()
  start(
    @Body(new ZodValidationPipe(CreateTailoringSessionRequestSchema))
    body: CreateTailoringSessionRequest,
  ): Promise<TailoringSessionView> {
    return this.sessions.start(body);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<TailoringSessionView> {
    return this.sessions.get(id);
  }

  /** Changes the CV options (RF-TAIL-07 to RF-TAIL-09); not while generating or once finalized. */
  @Patch(':id/options')
  updateOptions(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTailoringOptionsRequestSchema))
    body: UpdateTailoringOptionsRequest,
  ): Promise<TailoringSessionView> {
    return this.sessions.updateOptions(id, body);
  }

  /** Retries the step that failed. */
  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  retry(@Param('id') id: string): Promise<TailoringSessionView> {
    return this.sessions.retry(id);
  }
}
