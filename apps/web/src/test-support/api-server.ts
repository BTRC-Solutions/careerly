import { HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

export const TEST_API_URL = 'http://api.test';
export const TEST_API_TOKEN = 'test-token';

/** The local API, mocked: each test declares the responses it needs with `apiServer.use(...)`. */
export const apiServer = setupServer();

/** Starts the mock API for the test file. A request without a handler fails the test. */
export function setupApiServer() {
  let mswFetch: typeof fetch | undefined;
  beforeAll(() => {
    apiServer.listen({ onUnhandledFrame: 'error' });
    mswFetch = globalThis.fetch;
    globalThis.fetch = (input, init) =>
      withNodeFormData(init).then((compatInit) => mswFetch!(input, compatInit));
  });
  afterEach(() => apiServer.resetHandlers());
  afterAll(() => {
    if (mswFetch) globalThis.fetch = mswFetch;
    apiServer.close();
  });
}

/**
 * Under jsdom, `FormData` and `File` are jsdom's, which Node's `fetch` (the one MSW intercepts) cannot send:
 * an upload arrives broken. The browser has no such problem, so uploads are rebuilt with Node's classes,
 * keeping each file's name and type.
 */
async function withNodeFormData(init: RequestInit | undefined): Promise<RequestInit | undefined> {
  if (typeof document === 'undefined' || !(init?.body instanceof FormData)) return init;
  const NodeFormData = (
    await new Response('', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }).formData()
  ).constructor as typeof FormData;
  const { File: NodeFile } = await import('node:buffer');
  const body = new NodeFormData();
  for (const [key, value] of init.body.entries()) {
    body.append(
      key,
      typeof value === 'string'
        ? value
        : (new NodeFile([await value.arrayBuffer()], value.name, {
            type: value.type,
          }) as unknown as File),
    );
  }
  return { ...init, body };
}

/** `TEST_API_URL` + path, for handlers: `http.get(api('/templates'), ...)`. */
export function api(path: string): string {
  return `${TEST_API_URL}${path}`;
}

/** An error in the API's shared shape (`ApiErrorResponse`). */
export function apiError(status: number, code: string, message = 'Error.') {
  return HttpResponse.json({ error: { code, message } }, { status });
}
