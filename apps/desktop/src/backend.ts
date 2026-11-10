import { utilityProcess, type UtilityProcess } from 'electron';

const STARTUP_TIMEOUT_MS = 20_000;
const SHUTDOWN_TIMEOUT_MS = 3_000;

export interface BackendOptions {
  /** Path to the compiled API entry (`apps/api/dist/main.js`). */
  entry: string;
  dataDir: string;
  token: string;
  appVersion: string;
  allowedOrigins: string[];
  /** Forward the API's stdout/stderr to this process (useful when running from source). */
  forwardOutput: boolean;
}

export interface RunningBackend {
  url: string;
  stop(): Promise<void>;
}

type BackendMessage = { type: 'ready'; port: number } | { type: 'fatal'; message: string };

/**
 * Starts the NestJS API in an Electron utility process and waits until it is listening.
 * The API picks a free port on 127.0.0.1 and reports it back.
 */
export function startBackend(options: BackendOptions): Promise<RunningBackend> {
  const child = utilityProcess.fork(options.entry, [], {
    serviceName: 'Careerly API',
    stdio: 'pipe',
    env: {
      ...process.env,
      CAREERLY_DATA_DIR: options.dataDir,
      CAREERLY_API_TOKEN: options.token,
      CAREERLY_API_PORT: '0',
      CAREERLY_ALLOWED_ORIGINS: options.allowedOrigins.join(','),
      CAREERLY_APP_VERSION: options.appVersion,
      CAREERLY_LOG_TO_STDOUT: options.forwardOutput ? 'true' : 'false',
    },
  });

  if (options.forwardOutput) {
    child.stdout?.on('data', (chunk: Buffer) => process.stdout.write(chunk));
    child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('The local service did not start in time.'));
    }, STARTUP_TIMEOUT_MS);

    const onExit = (code: number) => {
      clearTimeout(timeout);
      reject(new Error(`The local service exited during startup (code ${code}).`));
    };
    child.once('exit', onExit);

    child.on('message', (message: BackendMessage) => {
      if (message.type === 'fatal') {
        clearTimeout(timeout);
        child.off('exit', onExit);
        reject(new Error(message.message));
        return;
      }
      if (message.type === 'ready') {
        clearTimeout(timeout);
        child.off('exit', onExit);
        resolve({ url: `http://127.0.0.1:${message.port}`, stop: () => stopBackend(child) });
      }
    });
  });
}

function stopBackend(child: UtilityProcess): Promise<void> {
  if (child.pid === undefined) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill();
      resolve();
    }, SHUTDOWN_TIMEOUT_MS);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    // Graceful shutdown: lets Nest close the database connection.
    child.postMessage({ type: 'shutdown' });
  });
}
