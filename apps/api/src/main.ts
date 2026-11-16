import 'reflect-metadata';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './platform/config/app-config.js';
import { createLogger } from './platform/logging/logger.js';
import { AiKeyStore } from './platform/secrets/ai-key-store.js';
import { type RunningServer, startServer } from './server.js';

/**
 * Messages exchanged with the Electron main process when running inside `utilityProcess`.
 * Standalone (`npm run dev:web`) there is no parent port and these are skipped.
 */
type ParentMessage = { type: 'ready'; port: number } | { type: 'fatal'; message: string };

/**
 * Messages from Electron's main process. `ai-key` carries the key decrypted with `safeStorage`
 * (at startup and whenever the user changes it; `null` removes it). It is kept in memory only.
 */
type ChildMessage = { type: 'shutdown' } | { type: 'ai-key'; apiKey: string | null };

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
  const aiKeyStore = new AiKeyStore();
  let server: RunningServer | undefined;

  const shutdown = async () => {
    logger.info('Shutting down');
    await server?.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  // Listen before starting the server: main may send the key while migrations are still running.
  parentPort?.on('message', (event) => {
    const message = event.data as Partial<ChildMessage> | undefined;
    if (message?.type === 'shutdown') {
      void shutdown();
    } else if (message?.type === 'ai-key') {
      const apiKey = typeof message.apiKey === 'string' ? message.apiKey : null;
      aiKeyStore.set(apiKey);
      // Never log the key itself (RNF-03).
      logger.info({ configured: aiKeyStore.isConfigured() }, 'AI key updated');
    }
  });

  try {
    server = await startServer(config, logger, aiKeyStore);
    parentPort?.postMessage({ type: 'ready', port: server.port });
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
