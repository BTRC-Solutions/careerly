import 'reflect-metadata';
import { type Logger, pino } from 'pino';
import { type AppConfig, loadConfig } from '../platform/config/app-config.js';
import { startServer, type RunningServer } from '../server.js';
import { MIGRATIONS_DIR } from './temp-dir.js';

export const TEST_TOKEN = 'integration-test-token';

/** Config for an API whose data lives in `dataDir` (use a folder from `createTempDir`). */
export function testConfig(dataDir: string, env: NodeJS.ProcessEnv = {}): AppConfig {
  return loadConfig(
    { CAREERLY_DATA_DIR: dataDir, CAREERLY_API_TOKEN: TEST_TOKEN, ...env },
    { defaultMigrationsDir: MIGRATIONS_DIR },
  );
}

/** Starts the real API on a free port (silent logs unless a logger is given). Call `close()` in `afterEach`. */
export function startTestServer(
  config: AppConfig,
  logger: Logger = pino({ level: 'silent' }),
): Promise<RunningServer> {
  return startServer(config, logger);
}

/** A debug-level logger that keeps every log line in memory, to assert what is (not) logged. */
export function capturingLogger(): { logger: Logger; output: () => string } {
  const lines: string[] = [];
  const logger = pino({ level: 'trace' }, { write: (line: string) => lines.push(line) });
  return { logger, output: () => lines.join('') };
}

export type { RunningServer };
