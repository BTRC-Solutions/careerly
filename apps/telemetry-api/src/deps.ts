import type { Logger } from 'pino';
import type { TelemetryApiConfig } from './config.js';
import type { TelemetryDb } from './database/database.js';

/** What the app is built with, so the tests can give it PGlite, a silent logger and their own clock. */
export interface AppDeps {
  config: TelemetryApiConfig;
  db: TelemetryDb;
  logger: Logger;
  now: () => Date;
}

/** Nest token for {@link AppDeps}. */
export const APP_DEPS = Symbol('APP_DEPS');
