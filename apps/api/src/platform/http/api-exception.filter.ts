import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiErrorCode as ApiErrorCodeSchema,
  type ApiErrorCode,
  type ApiErrorResponse,
} from '@careerly/contracts';

interface JsonResponse {
  status(code: number): { json(body: unknown): void };
}

const CODE_BY_STATUS: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_FAILED',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'VALIDATION_FAILED',
};

/**
 * An `HttpException` can name its code explicitly with `{ code, message }` as its response
 * (e.g. `AI_RATE_LIMITED`), when the HTTP status alone is not specific enough.
 */
function explicitCode(exception: HttpException): ApiErrorCode | undefined {
  const response = exception.getResponse();
  if (typeof response !== 'object' || response === null || !('code' in response)) return undefined;
  const parsed = ApiErrorCodeSchema.safeParse(response.code);
  return parsed.success ? parsed.data : undefined;
}

/** Turns every error into the shared `{ error: { code, message } }` shape. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<JsonResponse>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body: ApiErrorResponse = {
        error: {
          code: explicitCode(exception) ?? CODE_BY_STATUS[status] ?? 'INTERNAL_ERROR',
          message: exception.message,
        },
      };
      response.status(status).json(body);
      return;
    }

    // Unexpected error: log the message and stack only (never request bodies, RNF-02).
    const error = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(error.message, error.stack);
    const body: ApiErrorResponse = {
      error: { code: 'INTERNAL_ERROR', message: 'Unexpected error.' },
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }
}
