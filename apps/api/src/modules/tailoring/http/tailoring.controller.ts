import {
  type ListTailoringSessionsQuery,
  ListTailoringSessionsQuerySchema,
  type TailoringSessionList,
  type ApiErrorCode,
  type CreateTailoringSessionRequest,
  type GapAnswer,
  GapAnswerSchema,
  type GapQuestions,
  CreateTailoringSessionRequestSchema,
  type EditTailoredResumeRequest,
  EditTailoredResumeRequestSchema,
  type FinalizeSessionRequest,
  FinalizeSessionRequestSchema,
  type RegenerateResumesRequest,
  RegenerateResumesRequestSchema,
  type TailoredResume,
  type ResumeLanguage,
  ResumeLanguageSchema,
  type ResumeVersionList,
  type TailoredResumesView,
  type RevertProfileChangesRequest,
  RevertProfileChangesRequestSchema,
  type RevertProfileChangesResult,
  type SessionProfileChanges,
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
  Put,
  UseInterceptors,
} from '@nestjs/common';
import { catchError, type Observable, throwError } from 'rxjs';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { GapsService } from '../application/gaps.service.js';
import { SessionProfileChangesService } from '../application/session-profile-changes.service.js';
import { TailoringSessionsService } from '../application/tailoring-sessions.service.js';
import {
  GapQuestionNotFoundError,
  JobDescriptionNotReadyError,
  ResumeNotEditableError,
  ResumeRenderFailedError,
  ResumesOverBudgetError,
  TailoredResumeNotFoundError,
  SessionProfileChangeNotFoundError,
  SessionNotMatchedError,
  TailoringJobPostingNotFoundError,
  TailoringSessionNotFoundError,
  TailoringTemplateNotFoundError,
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
    error instanceof BulletNotFoundError ||
    error instanceof GapQuestionNotFoundError ||
    error instanceof SessionProfileChangeNotFoundError
  ) {
    return new NotFoundException(error.message);
  }
  if (
    error instanceof JobDescriptionNotReadyError ||
    error instanceof SessionNotMatchedError ||
    error instanceof InvalidSessionTransitionError ||
    error instanceof ResumeWithoutNameError ||
    error instanceof ResumeNotEditableError
  ) {
    return new ConflictException(error.message);
  }
  if (
    error instanceof TailoringSessionValidationError ||
    error instanceof TailoringTemplateNotFoundError
  ) {
    return new BadRequestException(error.message);
  }
  if (error instanceof ResumesOverBudgetError) {
    return new HttpException(
      { code: 'RESUME_OVER_BUDGET' satisfies ApiErrorCode, message: error.message },
      HttpStatus.CONFLICT,
    );
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

/** Tailoring sessions (RF-TAIL-01, RF-TAIL-02, RF-TAIL-06, RF-TAIL-10, RF-TAIL-11). */
@Controller('tailoring-sessions')
@UseInterceptors(TailoringErrorsInterceptor)
export class TailoringController {
  constructor(
    private readonly sessions: TailoringSessionsService,
    private readonly gapsService: GapsService,
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

  /** The gap questions (RF-TAIL-04) with their answers; before asking, those of the last match. */
  @Get(':id/gaps')
  gaps(@Param('id') id: string): Promise<GapQuestions> {
    return this.gapsService.list(id);
  }

  /** Goes to the gap questions: after the match, or back from the review (keeps earlier answers). */
  @Post(':id/ask-gaps')
  @HttpCode(HttpStatus.OK)
  askGaps(@Param('id') id: string): Promise<GapQuestions> {
    return this.gapsService.ask(id);
  }

  /** Answers one gap question (RF-GAP-01); answers can change while the session awaits them. */
  @Put(':id/gaps/:requirementId')
  answerGap(
    @Param('id') id: string,
    @Param('requirementId') requirementId: string,
    @Body(new ZodValidationPipe(GapAnswerSchema)) body: GapAnswer,
  ): Promise<GapQuestions> {
    return this.gapsService.answer(id, requirementId, body);
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

  /**
   * Finalizes the session (RF-TAIL-14): one immutable CV per language, with its PDF. A CV over the page budget
   * needs `confirmOverBudget` (RN-04).
   */
  @Post(':id/finalize')
  @HttpCode(HttpStatus.OK)
  finalize(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(FinalizeSessionRequestSchema)) body: FinalizeSessionRequest,
  ): Promise<TailoringSessionView> {
    return this.sessions.finalize(id, body);
  }

  /** The session's finalized CVs; their PDFs are at `GET /resume-versions/:id/pdf`. */
  @Get(':id/resume-versions')
  listVersions(@Param('id') id: string): Promise<ResumeVersionList> {
    return this.sessions.listVersions(id);
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
