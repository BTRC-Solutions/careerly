import { ApiErrorResponseSchema } from '@careerly/contracts';
import { z } from 'zod';
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
  // FormData sets its own multipart Content-Type (with the boundary).
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const json: unknown = await response.json().catch(() => undefined);

  if (!response.ok) throw toApiError(response.status, json);
  return schema.parse(json);
}

function toApiError(status: number, json: unknown): ApiError {
  const parsed = ApiErrorResponseSchema.safeParse(json);
  return parsed.success
    ? new ApiError(status, parsed.data.error.code, parsed.data.error.message)
    : new ApiError(status, 'INTERNAL_ERROR', `Request failed (${status}).`);
}

/** GET a file (a PDF, a `.zip`) from the local API. Errors still come as JSON, like {@link apiRequest}. */
export async function apiGetBlob(path: string): Promise<Blob> {
  const { baseUrl, token } = getApiConnection();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw toApiError(response.status, await response.json().catch(() => undefined));
  }
  return response.blob();
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

/** POST to the local API and validate the JSON response. */
export function apiPost<T extends z.ZodType>(
  path: string,
  schema: T,
  body: unknown,
): Promise<z.infer<T>> {
  return apiRequest('POST', path, schema, body);
}

/** POST a file (multipart/form-data, field `file`) and validate the JSON response. */
export function apiUpload<T extends z.ZodType>(
  path: string,
  schema: T,
  file: File,
): Promise<z.infer<T>> {
  const form = new FormData();
  form.append('file', file);
  return apiRequest('POST', path, schema, form);
}

/** PUT to the local API and validate the JSON response. */
export function apiPut<T extends z.ZodType>(
  path: string,
  schema: T,
  body: unknown,
): Promise<z.infer<T>> {
  return apiRequest('PUT', path, schema, body);
}

/** DELETE on the local API (expects `204 No Content`). */
export async function apiDelete(path: string): Promise<void> {
  await apiRequest('DELETE', path, z.unknown());
}
