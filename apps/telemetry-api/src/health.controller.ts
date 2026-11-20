import type { ServerResponse } from 'node:http';
import { Controller, Get, Inject, Res } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { APP_DEPS, type AppDeps } from './deps.js';

/**
 * `GET /health` for the uptime check and Docker (ARCHITECTURE §19.7): the process is up and Postgres answers.
 * No versions, data or details of the database.
 */
@Controller('health')
export class HealthController {
  constructor(@Inject(APP_DEPS) private readonly deps: AppDeps) {}

  @Get()
  async health(@Res() response: ServerResponse): Promise<void> {
    let ok = true;
    try {
      await this.deps.db.execute(sql`SELECT 1`);
    } catch {
      ok = false;
    }
    response.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: ok ? 'ok' : 'unavailable' }));
  }
}
