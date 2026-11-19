import {
  type Application,
  type ApplicationList,
  type CreateApplicationRequest,
  CreateApplicationRequestSchema,
  type ListApplicationsQuery,
  ListApplicationsQuerySchema,
  type ResumeVersionList,
  type SendApplicationRequest,
  SendApplicationRequestSchema,
} from '@careerly/contracts';
import {
  BadRequestException,
  Body,
  type CallHandler,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  type NestInterceptor,
  NotFoundException,
  Param,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { catchError, type Observable, throwError } from 'rxjs';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { ApplicationsService } from '../application/applications.service.js';
import {
  ApplicationAlreadyExistsError,
  ApplicationJobPostingNotFoundError,
  ApplicationNotFoundError,
  UnknownResumeVersionError,
} from '../application/applications.ports.js';
import { InvalidApplicationTransitionError } from '../domain/application.js';

/** Maps the module's errors to HTTP (then shaped by `ApiExceptionFilter`). */
@Injectable()
class ApplicationsErrorsInterceptor implements NestInterceptor {
  intercept(_context: unknown, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(catchError((error: unknown) => throwError(() => toHttpError(error))));
  }
}

function toHttpError(error: unknown): unknown {
  if (
    error instanceof ApplicationNotFoundError ||
    error instanceof ApplicationJobPostingNotFoundError
  ) {
    return new NotFoundException(error.message);
  }
  if (
    error instanceof ApplicationAlreadyExistsError ||
    error instanceof InvalidApplicationTransitionError
  ) {
    return new ConflictException(error.message);
  }
  if (error instanceof UnknownResumeVersionError) return new BadRequestException(error.message);
  return error;
}

const SendableQuerySchema = z.object({ jobPostingId: z.string().min(1) });

/** Job applications (roadmap 7.3, RF-APP-01, RF-APP-02, RF-APP-08). */
@Controller('applications')
@UseInterceptors(ApplicationsErrorsInterceptor)
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  /** All the applications, or the one of a job description (`?jobPostingId=`). */
  @Get()
  list(
    @Query(new ZodValidationPipe(ListApplicationsQuerySchema)) query: ListApplicationsQuery,
  ): Promise<ApplicationList> {
    return this.applications.list(query);
  }

  /** One per job description: saved, or already sent with some of its finalized CVs. */
  @Post()
  create(
    @Body(new ZodValidationPipe(CreateApplicationRequestSchema)) body: CreateApplicationRequest,
  ): Promise<Application> {
    return this.applications.create(body);
  }

  /** The finalized CVs of a job description, which can be sent with its application. */
  @Get('sendable-resumes')
  sendableResumes(
    @Query(new ZodValidationPipe(SendableQuerySchema)) query: { jobPostingId: string },
  ): Promise<ResumeVersionList> {
    return this.applications.sendableResumes(query.jobPostingId);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<Application> {
    return this.applications.get(id);
  }

  /** It was sent (RF-APP-02): a saved application becomes `APPLIED`; one already sent gets the new CVs. */
  @Post(':id/sent-resumes')
  @HttpCode(HttpStatus.OK)
  send(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SendApplicationRequestSchema)) body: SendApplicationRequest,
  ): Promise<Application> {
    return this.applications.send(id, body);
  }

  /** Deletes the application and the record of what was sent; the finalized CVs themselves stay. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id') id: string): Promise<void> {
    return this.applications.delete(id);
  }
}
