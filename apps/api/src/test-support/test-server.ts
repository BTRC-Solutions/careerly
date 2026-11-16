import 'reflect-metadata';
import { type Logger, pino } from 'pino';
import { type AppConfig, loadConfig } from '../platform/config/app-config.js';
import type { AiKeyStore } from '../platform/secrets/ai-key-store.js';
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

/**
 * Starts the real API on a free port. Call `close()` in `afterEach`.
 * Logs are silent unless a `logger` is given; `aiKeyStore` lets a test play Electron's main process.
 */
export function startTestServer(
  config: AppConfig,
  options: { aiKeyStore?: AiKeyStore; logger?: Logger } = {},
): Promise<RunningServer> {
  return startServer(config, options.logger ?? pino({ level: 'silent' }), options.aiKeyStore);
}

export type { RunningServer };
