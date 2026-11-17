import {
  BadRequestException,
  type CallHandler,
  ConflictException,
  type ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  type NestInterceptor,
  NotFoundException,
} from '@nestjs/common';
import type { ApiErrorCode } from '@careerly/contracts';
import { catchError, type Observable, throwError } from 'rxjs';
import {
  RenderError,
  type RenderFailure,
  TemplateNotFoundError,
  UserTemplateError,
} from '../application/documents.ports.js';

/** HTTP status and API error code for each reason a template render can fail. */
const RENDER_ERRORS: Record<RenderFailure, [number, ApiErrorCode]> = {
  COMPILE_ERROR: [HttpStatus.UNPROCESSABLE_ENTITY, 'TEMPLATE_INVALID'],
  TIMEOUT: [HttpStatus.UNPROCESSABLE_ENTITY, 'TEMPLATE_TIMEOUT'],
  RENDERER_UNAVAILABLE: [HttpStatus.SERVICE_UNAVAILABLE, 'RENDERER_UNAVAILABLE'],
};

/** Maps the documents module's template errors to HTTP errors (then shaped by `ApiExceptionFilter`). */
@Injectable()
export class TemplatesErrorsInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(catchError((error: unknown) => throwError(() => toHttpError(error))));
  }
}

function toHttpError(error: unknown): unknown {
  if (error instanceof TemplateNotFoundError) return new NotFoundException(error.message);
  if (error instanceof UserTemplateError) {
    if (error.reason === 'BUILT_IN') return new ForbiddenException(error.message);
    if (error.reason === 'IN_USE') return new ConflictException(error.message);
    return new BadRequestException(error.message);
  }
  if (error instanceof RenderError) {
    // The diagnostics are for the template's author, who is the user: they are shown, never logged.
    const message = error.diagnostics ? `${error.message}\n\n${error.diagnostics}` : error.message;
    const [status, code] = RENDER_ERRORS[error.reason];
    return new HttpException({ code, message }, status);
  }
  return error;
}
