import type { AddressInfo } from 'node:net';
import type { INestApplication, LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Logger } from 'pino';
import { AppModule } from './app.module.js';
import type { AppDeps } from './deps.js';

export interface RunningServer {
  app: INestApplication;
  port: number;
  close(): Promise<void>;
}

/** Nest's own messages (startup, routes) through pino. */
class NestPinoLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}
  log(message: unknown, context?: string) {
    this.logger.info({ context }, String(message));
  }
  error(message: unknown, stack?: string, context?: string) {
    this.logger.error({ context, stack }, String(message));
  }
  warn(message: unknown, context?: string) {
    this.logger.warn({ context }, String(message));
  }
}

/** Creates the receiver and starts listening. The body is read by the ingest route itself (raw, capped). */
export async function startServer(deps: AppDeps): Promise<RunningServer> {
  const app = await NestFactory.create(AppModule.register(deps), {
    bodyParser: false,
    logger: new NestPinoLogger(deps.logger),
  });
  // Caddy in front: the client IP comes in `X-Forwarded-For` (only for the in-memory limits, RNF-23).
  (app.getHttpAdapter().getInstance() as { set(name: string, value: unknown): void }).set(
    'trust proxy',
    deps.config.trustProxyHops,
  );
  app.enableShutdownHooks();

  await app.listen(deps.config.port, deps.config.host);
  const port = (app.getHttpServer().address() as AddressInfo).port;
  deps.logger.info({ port }, 'Telemetry receiver listening');
  return { app, port, close: () => app.close() };
}
