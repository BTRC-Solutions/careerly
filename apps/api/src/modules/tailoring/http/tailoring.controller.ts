import {
  type CreateTailoringSessionRequest,
  type GapQuestions,
  CreateTailoringSessionRequestSchema,
  type RevertProfileChangesRequest,
  RevertProfileChangesRequestSchema,
  type RevertProfileChangesResult,
  type SessionProfileChanges,
  type TailoringSessionView,
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
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { catchError, type Observable, throwError } from 'rxjs';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { SessionProfileChangesService } from '../application/session-profile-changes.service.js';
import { TailoringSessionsService } from '../application/tailoring-sessions.service.js';
import {
  JobDescriptionNotReadyError,
  SessionProfileChangeNotFoundError,
  SessionNotMatchedError,
  TailoringJobPostingNotFoundError,
  TailoringSessionNotFoundError,
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
    error instanceof TailoringJobPostingNotFoundError ||
    error instanceof SessionProfileChangeNotFoundError
  ) {
    return new NotFoundException(error.message);
  }
  if (
    error instanceof JobDescriptionNotReadyError ||
    error instanceof SessionNotMatchedError ||
    error instanceof InvalidSessionTransitionError
  ) {
    return new ConflictException(error.message);
  }
  if (error instanceof TailoringSessionValidationError) {
    return new BadRequestException(error.message);
  }
  return error;
}

/** Tailoring sessions (RF-TAIL-01, RF-TAIL-02, RF-TAIL-06). */
@Controller('tailoring-sessions')
@UseInterceptors(TailoringErrorsInterceptor)
export class TailoringController {
  constructor(
    private readonly sessions: TailoringSessionsService,
    private readonly profileChanges: SessionProfileChangesService,
  ) {}

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

  /** The gap questions (RF-TAIL-04): partial and missing requirements of the last match. */
  @Get(':id/gaps')
  gaps(@Param('id') id: string): Promise<GapQuestions> {
    return this.sessions.gaps(id);
  }

  /** Retries the step that failed. */
  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  retry(@Param('id') id: string): Promise<TailoringSessionView> {
    return this.sessions.retry(id);
  }

  /** What the session added to or changed in the master profile (RF-TAIL-05). */
  @Get(':id/profile-changes')
  listProfileChanges(@Param('id') id: string): Promise<SessionProfileChanges> {
    return this.profileChanges.list(id);
  }

  /** Undoes the session's profile changes: every pending one, or only `changeIds` (RF-TAIL-06). */
  @Post(':id/revert-profile-changes')
  @HttpCode(HttpStatus.OK)
  revertProfileChanges(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RevertProfileChangesRequestSchema))
    body: RevertProfileChangesRequest,
  ): Promise<RevertProfileChangesResult> {
    return this.profileChanges.revert(id, body.changeIds);
  }
}
