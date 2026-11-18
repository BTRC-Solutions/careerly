import {
  type ListTailoringSessionsQuery,
  ListTailoringSessionsQuerySchema,
  type TailoringSessionList,
  type ApiErrorCode,
  type CreateTailoringSessionRequest,
  CreateTailoringSessionRequestSchema,
  type EditTailoredResumeRequest,
  EditTailoredResumeRequestSchema,
  type RegenerateResumesRequest,
  RegenerateResumesRequestSchema,
  type TailoredResume,
  type ResumeLanguage,
  ResumeLanguageSchema,
  type TailoredResumesView,
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
  HttpException,
  HttpStatus,
  Injectable,
  type NestInterceptor,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseInterceptors,
} from '@nestjs/common';
import { catchError, type Observable, throwError } from 'rxjs';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { TailoringSessionsService } from '../application/tailoring-sessions.service.js';
import {
  JobDescriptionNotReadyError,
  ResumeNotEditableError,
  ResumeRenderFailedError,
  TailoredResumeNotFoundError,
  TailoringJobPostingNotFoundError,
  TailoringSessionNotFoundError,
} from '../application/tailoring.ports.js';
import { BulletNotFoundError } from '../domain/resume-edits.js';
import { ResumeWithoutNameError } from '../domain/resume-writing.js';
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
    error instanceof TailoredResumeNotFoundError ||
    error instanceof BulletNotFoundError
  ) {
    return new NotFoundException(error.message);
  }
  if (
    error instanceof JobDescriptionNotReadyError ||
    error instanceof InvalidSessionTransitionError ||
    error instanceof ResumeWithoutNameError ||
    error instanceof ResumeNotEditableError
  ) {
    return new ConflictException(error.message);
  }
  if (error instanceof TailoringSessionValidationError) {
    return new BadRequestException(error.message);
  }
  if (error instanceof ResumeRenderFailedError) return renderHttpError(error);
  return error;
}

/** HTTP status and API error code for each reason a CV render can fail (as in the templates' routes). */
const RENDER_ERRORS: Record<ResumeRenderFailedError['reason'], [number, ApiErrorCode]> = {
  TEMPLATE_NOT_FOUND: [HttpStatus.NOT_FOUND, 'NOT_FOUND'],
  COMPILE_ERROR: [HttpStatus.UNPROCESSABLE_ENTITY, 'TEMPLATE_INVALID'],
  TIMEOUT: [HttpStatus.UNPROCESSABLE_ENTITY, 'TEMPLATE_TIMEOUT'],
  RENDERER_UNAVAILABLE: [HttpStatus.SERVICE_UNAVAILABLE, 'RENDERER_UNAVAILABLE'],
};

function renderHttpError(error: ResumeRenderFailedError): HttpException {
  const message = error.diagnostics
    ? `${error.message}

${error.diagnostics}`
    : error.message;
  const [status, code] = RENDER_ERRORS[error.reason];
  return new HttpException({ code, message }, status);
}

/** Tailoring sessions (RF-TAIL-01, RF-TAIL-02, RF-TAIL-10, RF-TAIL-11). */
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

  /** Sessions to resume (RF-TAIL-15): `?open=true` for the unfinished ones, `?jobPostingId=` for one posting. */
  @Get()
  list(
    @Query(new ZodValidationPipe(ListTailoringSessionsQuerySchema))
    query: ListTailoringSessionsQuery,
  ): Promise<TailoringSessionList> {
    return this.sessions.list(query);
  }

  /** Leaves the session; it stays stored but is no longer open. */
  @Post(':id/abandon')
  @HttpCode(HttpStatus.OK)
  abandon(@Param('id') id: string): Promise<TailoringSessionView> {
    return this.sessions.abandon(id);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<TailoringSessionView> {
    return this.sessions.get(id);
  }

  /** Retries the step that failed. */
  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  retry(@Param('id') id: string): Promise<TailoringSessionView> {
    return this.sessions.retry(id);
  }

  /** Goes to the gap questions (needs gaps); from there the session can generate. */
  @Post(':id/gaps')
  @HttpCode(HttpStatus.OK)
  askGaps(@Param('id') id: string): Promise<TailoringSessionView> {
    return this.sessions.askGaps(id);
  }

  /** Writes the session's CVs in the background, one per language; the session goes to `REVIEW`. */
  @Post(':id/generate')
  @HttpCode(HttpStatus.OK)
  generate(@Param('id') id: string): Promise<TailoringSessionView> {
    return this.sessions.generate(id);
  }

  /**
   * Writes the CVs again from the review (RF-TAIL-13): whole, only the summary or one experience, with optional
   * indications. The user's edits and what is outside the scope are kept.
   */
  @Post(':id/regenerate')
  @HttpCode(HttpStatus.OK)
  regenerate(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RegenerateResumesRequestSchema)) body: RegenerateResumesRequest,
  ): Promise<TailoringSessionView> {
    return this.sessions.regenerate(id, body);
  }

  @Get(':id/resumes')
  listResumes(@Param('id') id: string): Promise<TailoredResumesView> {
    return this.sessions.listResumes(id);
  }

  /** One change to a CV under review (RF-TAIL-12); it is fitted to its pages again and returned. */
  @Patch(':id/resumes/:language')
  editResume(
    @Param('id') id: string,
    @Param('language', new ZodValidationPipe(ResumeLanguageSchema)) language: ResumeLanguage,
    @Body(new ZodValidationPipe(EditTailoredResumeRequestSchema)) body: EditTailoredResumeRequest,
  ): Promise<TailoredResume> {
    return this.sessions.editResume(id, language, body);
  }

  /** The CV of a language as a PDF, with the bullets its page fit chose. */
  @Get(':id/resumes/:language/preview')
  async resumePdf(
    @Param('id') id: string,
    @Param('language', new ZodValidationPipe(ResumeLanguageSchema)) language: ResumeLanguage,
  ): Promise<StreamableFile> {
    const pdf = await this.sessions.renderResume(id, language);
    return new StreamableFile(pdf, { type: 'application/pdf' });
  }
}
