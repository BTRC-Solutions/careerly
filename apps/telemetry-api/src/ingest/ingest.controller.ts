import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  TELEMETRY_MAX_BODY_BYTES,
  TELEMETRY_POW_HEADER,
  TELEMETRY_SIGNATURE_HEADER,
  type TelemetryErrorResponse,
} from '@careerly/contracts';
import { Controller, Post, Req, Res } from '@nestjs/common';
import { type IngestAnswer, IngestService } from './ingest.service.js';

/** Express adds the client IP, already read from `X-Forwarded-For` behind Caddy (`trust proxy`). */
type Request = IncomingMessage & { ip?: string };

const TOO_LARGE: IngestAnswer = {
  status: 413,
  body: { error: { code: 'PAYLOAD_TOO_LARGE' } } satisfies TelemetryErrorResponse,
};

/** The only public route of the receiver (Caddy exposes nothing else). */
@Controller('v1/reports')
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post()
  async receive(@Req() request: Request, @Res() response: ServerResponse): Promise<void> {
    const body = await readBody(request, TELEMETRY_MAX_BODY_BYTES);
    const answer =
      body === null
        ? TOO_LARGE
        : await this.ingest.ingest({
            ip: request.ip ?? request.socket.remoteAddress ?? 'unknown',
            contentType: request.headers['content-type'],
            body,
            signature: header(request, TELEMETRY_SIGNATURE_HEADER),
            pow: header(request, TELEMETRY_POW_HEADER),
          });
    response.writeHead(answer.status, {
      'Content-Type': 'application/json',
      ...answer.headers,
      ...(body === null ? { Connection: 'close' } : {}),
    });
    response.end(JSON.stringify(answer.body));
  }
}

function header(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The raw body, cut as soon as it goes past `limit` (first by `Content-Length`, then while reading): `null`
 * when it is too large. The signature is checked over these exact bytes.
 */
function readBody(request: IncomingMessage, limit: number): Promise<Buffer | null> {
  const declared = Number(request.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) {
    request.resume();
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    request.on('data', (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        request.resume();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (!done) resolve(Buffer.concat(chunks));
    });
    request.on('error', reject);
  });
}
