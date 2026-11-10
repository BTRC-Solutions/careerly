import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Validates a request value (usually the body) with a shared contract schema.
 * Failures become `400 VALIDATION_FAILED` through `ApiExceptionFilter`.
 * The message lists paths and rules only, never the submitted values (RNF-02).
 */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const details = result.error.issues
        .map((issue) => (issue.path.length > 0 ? `${issue.path.join('.')}: ` : '') + issue.message)
        .join('; ');
      throw new BadRequestException(`Invalid request: ${details}`);
    }
    return result.data;
  }
}
