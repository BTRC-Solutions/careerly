import fs from 'node:fs';
import path from 'node:path';
import type { LoggerService } from '@nestjs/common';
import { pino, type Logger } from 'pino';
import type { AppConfig } from '../config/app-config.js';

/**
 * Creates the app logger: a log file inside the data folder, plus stdout when enabled (development).
 *
 * Privacy rule (RNF-02): never log profile content, job descriptions or prompts —
 * only ids, sizes, timings and error messages.
 */
export function createLogger(config: Pick<AppConfig, 'logsDir' | 'logLevel' | 'logToStdout'>) {
  fs.mkdirSync(config.logsDir, { recursive: true });

  const streams: pino.StreamEntry[] = [
    {
      level: config.logLevel,
      stream: pino.destination({ dest: path.join(config.logsDir, 'api.log'), sync: false }),
    },
  ];
  if (config.logToStdout) {
    streams.push({ level: config.logLevel, stream: process.stdout });
  }

  // TODO: rotate log files (e.g. daily, keep the last 7) before the first release.
  return pino({ level: config.logLevel, base: { service: 'api' } }, pino.multistream(streams));
}

/** Adapts pino to Nest's logger interface. */
export class NestPinoLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, context?: string) {
    this.logger.info({ context }, String(message));
  }

  error(message: unknown, stackOrContext?: string, context?: string) {
    this.logger.error(
      { context: context ?? stackOrContext, stack: context ? stackOrContext : undefined },
      String(message),
    );
  }

  warn(message: unknown, context?: string) {
    this.logger.warn({ context }, String(message));
  }

  debug(message: unknown, context?: string) {
    this.logger.debug({ context }, String(message));
  }

  verbose(message: unknown, context?: string) {
    this.logger.trace({ context }, String(message));
  }

  fatal(message: unknown, context?: string) {
    this.logger.fatal({ context }, String(message));
  }
}
