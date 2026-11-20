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

/**
 * Drizzle writes the parameters of a failed query into its error message and stack (`Failed query: …` and a
 * `params: …` line), and those parameters are the user's data (RNF-02). They are cut from everything logged;
 * the query itself (tables and columns) stays, to diagnose the failure.
 */
export function withoutQueryParams(text: string): string {
  return text.replace(/\nparams: [\s\S]*?(?=\n\s+at |$)/, '\nparams: [not logged]');
}

const safe = (message: unknown) => withoutQueryParams(String(message));

/** Adapts pino to Nest's logger interface. */
export class NestPinoLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, context?: string) {
    this.logger.info({ context }, safe(message));
  }

  error(message: unknown, stackOrContext?: string, context?: string) {
    this.logger.error(
      {
        context: context ?? stackOrContext,
        stack: context && stackOrContext ? withoutQueryParams(stackOrContext) : undefined,
      },
      safe(message),
    );
  }

  warn(message: unknown, context?: string) {
    this.logger.warn({ context }, safe(message));
  }

  debug(message: unknown, context?: string) {
    this.logger.debug({ context }, safe(message));
  }

  verbose(message: unknown, context?: string) {
    this.logger.trace({ context }, safe(message));
  }

  fatal(message: unknown, context?: string) {
    this.logger.fatal({ context }, safe(message));
  }
}
