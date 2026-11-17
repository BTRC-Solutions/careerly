import {
  BadRequestException,
  HttpException,
  HttpStatus,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  NotFoundException,
} from '@nestjs/common';
import { catchError, type Observable, throwError } from 'rxjs';
import {
  AchievementSuggestionError,
  type SuggestionFailure,
} from '../application/achievement-suggestion.ports.js';
import { CvImportError, type CvImportFailure } from '../application/cv-import.ports.js';
import { InvalidToolNameError } from '../application/tool-catalog.service.js';
import { ProfileNotFoundError, ProfileValidationError } from '../domain/profile-errors.js';

/** HTTP status and API error code for each reason a CV import or a suggestion can fail. */
const AI_ERRORS: Record<CvImportFailure | SuggestionFailure, [number, string]> = {
  UNREADABLE_FILE: [HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED'],
  AI_NOT_CONFIGURED: [HttpStatus.CONFLICT, 'AI_NOT_CONFIGURED'],
  AI_KEY_REJECTED: [HttpStatus.CONFLICT, 'AI_KEY_REJECTED'],
  AI_RATE_LIMITED: [HttpStatus.TOO_MANY_REQUESTS, 'AI_RATE_LIMITED'],
  AI_UNAVAILABLE: [HttpStatus.SERVICE_UNAVAILABLE, 'AI_UNAVAILABLE'],
  AI_FAILED: [HttpStatus.BAD_GATEWAY, 'AI_FAILED'],
  AI_UNFAITHFUL: [HttpStatus.BAD_GATEWAY, 'AI_UNFAITHFUL'],
};

/** Maps the profile module's errors to HTTP errors (then shaped by `ApiExceptionFilter`). */
@Injectable()
export class ProfileErrorsInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof ProfileNotFoundError) {
          return throwError(() => new NotFoundException(error.message));
        }
        if (error instanceof ProfileValidationError || error instanceof InvalidToolNameError) {
          return throwError(() => new BadRequestException(error.message));
        }
        if (error instanceof CvImportError || error instanceof AchievementSuggestionError) {
          const [status, code] = AI_ERRORS[error.reason];
          return throwError(() => new HttpException({ code, message: error.message }, status));
        }
        return throwError(() => error);
      }),
    );
  }
}
