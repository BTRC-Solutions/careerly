import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiErrorResponse } from '@careerly/contracts';

/** The port the server actually listens on (known only after `listen`). */
export interface ServerAddress {
  port: number | undefined;
}

export interface LocalAccessOptions {
  apiToken: string;
  allowedOrigins: string[];
  address: ServerAddress;
}

export type LocalAccessResult =
  { allowed: true } | { allowed: false; status: 401 | 403; body: ApiErrorResponse };

/**
 * Decides whether a request may reach the local API (RNF-19):
 * - `Host` must be the loopback address and our port (blocks DNS rebinding).
 * - `Origin`, when present, must be one of the allowed origins (blocks other websites).
 * - `Authorization: Bearer <token>` must match the per-launch token.
 */
export function checkLocalAccess(
  headers: IncomingMessage['headers'],
  options: LocalAccessOptions,
): LocalAccessResult {
  const port = options.address.port;
  const allowedHosts = port === undefined ? [] : [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!headers.host || !allowedHosts.includes(headers.host)) {
    return forbidden('Host not allowed.');
  }

  const origin = headers.origin;
  if (origin !== undefined && !options.allowedOrigins.includes(origin)) {
    return forbidden('Origin not allowed.');
  }

  const authorization = headers.authorization ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
  if (!tokensMatch(token, options.apiToken)) {
    return {
      allowed: false,
      status: 401,
      body: { error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token.' } },
    };
  }

  return { allowed: true };
}

/** Express-compatible middleware around {@link checkLocalAccess}. */
export function localAccessMiddleware(options: LocalAccessOptions) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const result = checkLocalAccess(req.headers, options);
    if (result.allowed) {
      next();
      return;
    }
    res.statusCode = result.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result.body));
  };
}

function forbidden(message: string): LocalAccessResult {
  return { allowed: false, status: 403, body: { error: { code: 'FORBIDDEN', message } } };
}

function tokensMatch(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
