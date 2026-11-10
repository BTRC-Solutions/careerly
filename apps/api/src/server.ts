import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Logger } from 'pino';
import { AppModule } from './app.module.js';
import type { AppConfig } from './platform/config/app-config.js';
import { localAccessMiddleware, type ServerAddress } from './platform/http/local-access.js';
import { NestPinoLogger } from './platform/logging/logger.js';

export interface RunningServer {
  app: INestApplication;
  port: number;
  close(): Promise<void>;
}

/** Creates the Nest app, applies the local security rules and starts listening on 127.0.0.1. */
export async function startServer(config: AppConfig, logger: Logger): Promise<RunningServer> {
  const app = await NestFactory.create(AppModule.register(config), {
    logger: new NestPinoLogger(logger),
  });

  app.enableCors({
    origin: config.allowedOrigins,
    allowedHeaders: ['Authorization', 'Content-Type'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  const address: ServerAddress = { port: undefined };
  app.use(
    localAccessMiddleware({
      apiToken: config.apiToken,
      allowedOrigins: config.allowedOrigins,
      address,
    }),
  );
  app.enableShutdownHooks();

  await app.listen(config.port, config.host);
  const port = (app.getHttpServer().address() as AddressInfo).port;
  address.port = port;
  logger.info({ port }, 'API listening');

  return { app, port, close: () => app.close() };
}
