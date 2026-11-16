import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  NotFoundException,
} from '@nestjs/common';
import { catchError, type Observable, throwError } from 'rxjs';
import { BackupRejectedError } from '../domain/backup-errors.js';

/** Maps a rejected backup to 404 (missing file) or 400 (invalid or too new). */
@Injectable()
export class BackupErrorsInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof BackupRejectedError) {
          return throwError(() =>
            error.reason === 'NOT_FOUND'
              ? new NotFoundException(error.message)
              : new BadRequestException(error.message),
          );
        }
        return throwError(() => error);
      }),
    );
  }
}
