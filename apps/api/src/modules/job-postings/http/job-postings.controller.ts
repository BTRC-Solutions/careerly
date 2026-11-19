import {
  type CreateJobPostingRequest,
  CreateJobPostingRequestSchema,
  type JobAnalysis,
  type JobAnalysisState,
  type JobPosting,
  type JobPostingSummary,
  type JobView,
  type UpdateJobAnalysisRequest,
  UpdateJobAnalysisRequestSchema,
  type UpdateJobPostingRequest,
  UpdateJobPostingRequestSchema,
} from '@careerly/contracts';
import {
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
  Patch,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { catchError, type Observable, throwError } from 'rxjs';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import {
  AnalysisInProgressError,
  JobAnalysisNotFoundError,
  JobAnalysisService,
} from '../application/job-analysis.service.js';
import {
  JobPostingInUseError,
  JobPostingNotFoundError,
} from '../application/job-postings.repository.js';
import { JobPostingsService } from '../application/job-postings.service.js';

/**
 * Maps a missing job posting or analysis to 404, and corrections during an analysis to 409 (then shaped
 * by `ApiExceptionFilter`).
 */
@Injectable()
class JobPostingErrorsInterceptor implements NestInterceptor {
  intercept(_context: unknown, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(catchError((error: unknown) => throwError(() => toHttpError(error))));
  }
}

function toHttpError(error: unknown): unknown {
  if (error instanceof JobPostingNotFoundError || error instanceof JobAnalysisNotFoundError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof AnalysisInProgressError || error instanceof JobPostingInUseError) {
    return new ConflictException(error.message);
  }
  return error;
}

/** Job descriptions (RF-JD-01) and their analysis (RF-JD-02, RF-JD-03). */
@Controller('job-postings')
@UseInterceptors(JobPostingErrorsInterceptor)
export class JobPostingsController {
  constructor(
    private readonly postings: JobPostingsService,
    private readonly analyses: JobAnalysisService,
  ) {}

  @Get()
  list(): Promise<JobPostingSummary[]> {
    return this.postings.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateJobPostingRequestSchema)) body: CreateJobPostingRequest,
  ): Promise<JobPosting> {
    return this.postings.create(body);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<JobPosting> {
    return this.postings.get(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateJobPostingRequestSchema)) body: UpdateJobPostingRequest,
  ): Promise<JobPosting> {
    return this.postings.update(id, body);
  }

  /** Starts (or restarts) the AI analysis in the background; follow it with `/jobs/:id`. */
  @Post(':id/analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  analyze(@Param('id') id: string): Promise<JobView> {
    return this.analyses.request(id);
  }

  @Get(':id/analysis')
  analysis(@Param('id') id: string): Promise<JobAnalysisState> {
    return this.analyses.state(id);
  }

  /** The user's corrections to the analysis (RF-JD-03). */
  @Patch(':id/analysis')
  correctAnalysis(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateJobAnalysisRequestSchema)) body: UpdateJobAnalysisRequest,
  ): Promise<JobAnalysis> {
    return this.analyses.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id') id: string): Promise<void> {
    return this.postings.delete(id);
  }
}
