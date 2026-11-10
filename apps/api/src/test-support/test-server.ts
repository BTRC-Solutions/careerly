import 'reflect-metadata';
import { pino } from 'pino';
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

/** Starts the real API on a free port with silent logs. Call `close()` in `afterEach`. */
export function startTestServer(config: AppConfig): Promise<RunningServer> {
  return startServer(config, pino({ level: 'silent' }));
}

export type { RunningServer };
