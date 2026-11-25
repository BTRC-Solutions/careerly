import { TelemetryErrorResponseSchema } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { type ReceiverAnswer, TelemetryTransport } from '../application/telemetry.ports.js';

const TIMEOUT_MS = 20_000;

/** `POST /v1/reports` with `fetch`. Only the status, `Retry-After` and the asked difficulty are read. */
@Injectable()
export class FetchTelemetryTransport extends TelemetryTransport {
  async post(url: string, body: string, headers: Record<string, string>): Promise<ReceiverAnswer> {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const retryAfter = Number(response.headers.get('retry-after'));
    let difficulty: number | null = null;
    if (response.status === 428) {
      const parsed = TelemetryErrorResponseSchema.safeParse(
        await response.json().catch(() => null),
      );
      difficulty = parsed.success ? (parsed.data.error.difficulty ?? null) : null;
    } else {
      await response.body?.cancel();
    }
    return {
      status: response.status,
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
      difficulty,
    };
  }
}
