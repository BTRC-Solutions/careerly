import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type TelemetryErrorResponse } from '@careerly/contracts';
import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import { z } from 'zod';
import { APP_DEPS, type AppDeps } from '../deps.js';
import { addDays, utcDay } from '../ingest/days.js';
import { StatsService } from './stats.service.js';

/** Header with the secret shared with `stats-web`. */
export const INTERNAL_SECRET_HEADER = 'x-internal-secret';
/** Longest period one request can ask for. */
const MAX_PERIOD_DAYS = 366;

const PeriodSchema = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() });

/**
 * `GET /internal/stats?from=&to=`: the aggregates for the public page (ARCHITECTURE §19.4). Caddy does not route
 * `/internal` from outside; inside the Docker network it also needs the shared secret. Without dates, the last
 * 30 days.
 */
@Controller('internal/stats')
export class StatsController {
  constructor(
    @Inject(APP_DEPS) private readonly deps: AppDeps,
    private readonly stats: StatsService,
  ) {}

  @Get()
  async get(@Req() request: IncomingMessage, @Res() response: ServerResponse): Promise<void> {
    if (!this.authorized(request.headers[INTERNAL_SECRET_HEADER])) {
      return send(response, 401, {
        error: { code: 'UNAUTHORIZED' },
      } satisfies TelemetryErrorResponse);
    }
    const query = new URL(request.url ?? '/', 'http://internal').searchParams;
    const period = PeriodSchema.safeParse(Object.fromEntries(query));
    const to = period.data?.to ?? utcDay(this.deps.now());
    const from = period.data?.from ?? addDays(to, -29);
    if (!period.success || from > to || addDays(from, MAX_PERIOD_DAYS) < to) {
      return send(response, 400, { error: { code: 'INVALID_PERIOD' } });
    }
    send(response, 200, await this.stats.stats(from, to));
  }

  private authorized(given: string | string[] | undefined): boolean {
    if (typeof given !== 'string') return false;
    const expected = Buffer.from(this.deps.config.internalSecret);
    const actual = Buffer.from(given);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}
