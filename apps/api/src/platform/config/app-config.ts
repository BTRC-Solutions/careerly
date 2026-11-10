import path from 'node:path';
import { z } from 'zod';

/** DI token for the validated {@link AppConfig}. */
export const APP_CONFIG = Symbol('APP_CONFIG');

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const EnvSchema = z.object({
  CAREERLY_DATA_DIR: z.string().min(1, 'CAREERLY_DATA_DIR is required'),
  CAREERLY_API_TOKEN: z.string().min(16, 'CAREERLY_API_TOKEN must have at least 16 characters'),
  CAREERLY_API_PORT: z.coerce.number().int().min(0).max(65535).default(0),
  CAREERLY_ALLOWED_ORIGINS: z.string().default(''),
  CAREERLY_APP_VERSION: z.string().min(1).default('0.0.0-dev'),
  CAREERLY_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CAREERLY_LOG_TO_STDOUT: booleanString,
  CAREERLY_MIGRATIONS_DIR: z.string().min(1).optional(),
});

export interface AppConfig {
  /** Root folder for all local data (database, files, backups, logs). */
  dataDir: string;
  databaseFile: string;
  backupsDir: string;
  logsDir: string;
  migrationsDir: string;
  /** Per-launch secret that every request must send as `Authorization: Bearer <token>`. */
  apiToken: string;
  /** The API always listens on the loopback interface only. */
  host: '127.0.0.1';
  /** 0 means "any free port". */
  port: number;
  /** Origins allowed to call the API from a browser context (the renderer). */
  allowedOrigins: string[];
  appVersion: string;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  logToStdout: boolean;
}

export class ConfigError extends Error {
  constructor(issues: string[]) {
    super(`Invalid configuration:\n- ${issues.join('\n- ')}`);
    this.name = 'ConfigError';
  }
}

/**
 * Builds the app configuration from environment variables.
 * Relative paths are resolved against `cwd`.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv,
  options: { defaultMigrationsDir: string; cwd?: string },
): AppConfig {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  const parsed = result.data;
  const cwd = options.cwd ?? process.cwd();
  const dataDir = path.resolve(cwd, parsed.CAREERLY_DATA_DIR);

  return {
    dataDir,
    databaseFile: path.join(dataDir, 'careerly.db'),
    backupsDir: path.join(dataDir, 'backups'),
    logsDir: path.join(dataDir, 'logs'),
    migrationsDir: path.resolve(
      cwd,
      parsed.CAREERLY_MIGRATIONS_DIR ?? options.defaultMigrationsDir,
    ),
    apiToken: parsed.CAREERLY_API_TOKEN,
    host: '127.0.0.1',
    port: parsed.CAREERLY_API_PORT,
    allowedOrigins: parsed.CAREERLY_ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    appVersion: parsed.CAREERLY_APP_VERSION,
    logLevel: parsed.CAREERLY_LOG_LEVEL,
    logToStdout: parsed.CAREERLY_LOG_TO_STDOUT,
  };
}
