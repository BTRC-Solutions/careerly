import {
  type CreateJobPostingRequest,
  CreateJobPostingRequestSchema,
  type JobPosting,
  type JobPostingSummary,
  type UpdateJobPostingRequest,
  UpdateJobPostingRequestSchema,
} from '@careerly/contracts';
import {
  Body,
  type CallHandler,
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
import { JobPostingNotFoundError } from '../application/job-postings.repository.js';
import { JobPostingsService } from '../application/job-postings.service.js';

/** Maps a missing job posting to 404 (then shaped by `ApiExceptionFilter`). */
@Injectable()
class JobPostingErrorsInterceptor implements NestInterceptor {
  intercept(_context: unknown, next: CallHandler): Observable<unknown> {
    return next
      .handle()
      .pipe(
        catchError((error: unknown) =>
          throwError(() =>
            error instanceof JobPostingNotFoundError ? new NotFoundException(error.message) : error,
          ),
        ),
      );
  }
}

/** Job descriptions (RF-JD-01). */
@Controller('job-postings')
@UseInterceptors(JobPostingErrorsInterceptor)
export class JobPostingsController {
  constructor(private readonly postings: JobPostingsService) {}

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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id') id: string): Promise<void> {
    return this.postings.delete(id);
  }
}
