import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  NotFoundException,
} from '@nestjs/common';
import { catchError, type Observable, throwError } from 'rxjs';
import { InvalidToolNameError } from '../application/tool-catalog.service.js';
import { ProfileNotFoundError, ProfileValidationError } from '../domain/profile-errors.js';

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
        return throwError(() => error);
      }),
    );
  }
}
