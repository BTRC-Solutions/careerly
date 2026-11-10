import 'reflect-metadata';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './platform/config/app-config.js';
import { createLogger } from './platform/logging/logger.js';
import { startServer } from './server.js';

/**
 * Messages exchanged with the Electron main process when running inside `utilityProcess`.
 * Standalone (`npm run dev:web`) there is no parent port and these are skipped.
 */
type ParentMessage = { type: 'ready'; port: number } | { type: 'fatal'; message: string };

interface ParentPort {
  postMessage(message: ParentMessage): void;
  on(event: 'message', listener: (event: { data: unknown }) => void): void;
}

const parentPort = (process as NodeJS.Process & { parentPort?: ParentPort }).parentPort;
const here = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const config = loadConfig(process.env, {
    defaultMigrationsDir: path.join(here, '..', 'drizzle'),
  });
  const logger = createLogger(config);

  try {
    const server = await startServer(config, logger);
    parentPort?.postMessage({ type: 'ready', port: server.port });

    const shutdown = async () => {
      logger.info('Shutting down');
      await server.close();
      process.exit(0);
    };
    process.on('SIGINT', () => void shutdown());
    process.on('SIGTERM', () => void shutdown());
    parentPort?.on('message', (event) => {
      if ((event.data as { type?: string } | undefined)?.type === 'shutdown') {
        void shutdown();
      }
    });
  } catch (error) {
    logger.fatal({ err: error }, 'API failed to start');
    throw error;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  parentPort?.postMessage({ type: 'fatal', message });
  console.error(error);
  process.exit(1);
});
