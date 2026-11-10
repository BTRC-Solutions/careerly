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

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * Calls the local API and validates the JSON response with a shared contract schema.
 * Errors come back as {@link ApiError} with the API's `{ error: { code, message } }` details.
 */
export async function apiRequest<T extends z.ZodType>(
  method: Method,
  path: string,
  schema: T,
  body?: unknown,
): Promise<z.infer<T>> {
  const { baseUrl, token } = getApiConnection();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsed = ApiErrorResponseSchema.safeParse(json);
    throw parsed.success
      ? new ApiError(response.status, parsed.data.error.code, parsed.data.error.message)
      : new ApiError(response.status, 'INTERNAL_ERROR', `Request failed (${response.status}).`);
  }
  return schema.parse(json);
}

/** GET a JSON resource from the local API. */
export function apiGet<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
  return apiRequest('GET', path, schema);
}

/** PATCH a JSON resource on the local API. */
export function apiPatch<T extends z.ZodType>(
  path: string,
  schema: T,
  body: unknown,
): Promise<z.infer<T>> {
  return apiRequest('PATCH', path, schema, body);
}
