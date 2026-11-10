import { ApiErrorResponseSchema } from '@careerly/contracts';
import type { z } from 'zod';
import { getApiConnection } from '../desktop';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** GET a JSON resource from the local API and validate it with a shared contract schema. */
export async function apiGet<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
  const { baseUrl, token } = getApiConnection();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsed = ApiErrorResponseSchema.safeParse(body);
    throw parsed.success
      ? new ApiError(response.status, parsed.data.error.code, parsed.data.error.message)
      : new ApiError(response.status, 'INTERNAL_ERROR', `Request failed (${response.status}).`);
  }
  return schema.parse(body);
}
