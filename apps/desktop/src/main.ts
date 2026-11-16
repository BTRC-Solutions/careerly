import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AiProviderSchema } from '@careerly/contracts';
import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent, shell } from 'electron';
import { AiCredentialsSync } from './ai-credentials-sync.js';
import { AiKeyStore } from './ai-key-store.js';
import { APP_ORIGIN, registerAppScheme, serveUi } from './app-protocol.js';
import { startBackend, type RunningBackend } from './backend.js';
import { safeStorageEncryptor } from './safe-storage.js';
import { applySecurityPolicies } from './security.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.argv.includes('--dev');

interface Connection {
  /** Where the UI is loaded from. */
  uiUrl: string;
  apiBaseUrl: string;
  apiToken: string;
  /** For the backend's `/internal/*` routes. Never given to the renderer. */
  controlToken: string;
}

let backend: RunningBackend | undefined;
let quitting = false;

// Keep all data under <appData>/Careerly, both when installed and when run from source.
app.setName('Careerly');
app.setPath('userData', path.join(app.getPath('appData'), 'Careerly'));
registerAppScheme();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });

  app
    .whenReady()
    .then(start)
    .catch((error: unknown) => {
      dialog.showErrorBox(
        'Careerly could not start',
        error instanceof Error ? error.message : String(error),
      );
      app.exit(1);
    });
}

async function start() {
  const connection = isDev ? await developmentConnection() : await packagedConnection();

  const uiOrigin = new URL(connection.uiUrl).origin;
  applySecurityPolicies((url) => new URL(url).origin === uiOrigin);

  ipcMain.on('careerly:get-api-connection', (event) => {
    const senderOrigin = event.senderFrame ? new URL(event.senderFrame.url).origin : undefined;
    event.returnValue =
      senderOrigin === uiOrigin
        ? { apiBaseUrl: connection.apiBaseUrl, apiToken: connection.apiToken }
        : { apiBaseUrl: '', apiToken: '' };
  });

  const assertFromUi = (event: IpcMainInvokeEvent) => {
    const senderOrigin = event.senderFrame ? new URL(event.senderFrame.url).origin : undefined;
    if (senderOrigin !== uiOrigin) throw new Error('Not allowed.');
  };

  // The renderer never chooses the path: main asks the API for its data folder and opens only that.
  ipcMain.handle('careerly:open-data-folder', async (event) => {
    assertFromUi(event);
    const error = await shell.openPath(await fetchDataDir(connection));
    if (error) {
      throw new Error(error);
    }
  });

  registerAiKeyHandlers(connection, assertFromUi);
  createWindow(connection.uiUrl);
}

/**
 * API keys per AI provider (ADR-19, RF-CONF-01, RNF-03). The renderer can save, remove and pick
 * the active provider, and read which ones are configured, but it can never read a key back.
 * Every change is sent to the backend's memory right away (no restart).
 */
function registerAiKeyHandlers(
  connection: Connection,
  assertFromUi: (event: IpcMainInvokeEvent) => void,
) {
  const store = new AiKeyStore(
    path.join(app.getPath('userData'), 'secrets.bin'),
    safeStorageEncryptor,
    (message) => console.warn(`[ai-keys] ${message}`),
  );
  const sync = new AiCredentialsSync({
    apiBaseUrl: connection.apiBaseUrl,
    controlToken: connection.controlToken,
    activeCredentials: () => store.activeCredentials(),
  });

  const applyToBackend = async () => {
    try {
      await sync.push();
    } catch (error) {
      // Saved anyway; the next start (or the dev keep-alive) sends it again.
      console.warn(`[ai-keys] ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  void sync.pushWhenReady().catch((error: unknown) => {
    console.warn(`[ai-keys] ${error instanceof Error ? error.message : String(error)}`);
  });
  if (isDev) sync.startKeepAlive();

  ipcMain.handle('careerly:ai-keys:status', (event) => {
    assertFromUi(event);
    return store.status();
  });

  ipcMain.handle('careerly:ai-keys:save', async (event, provider: unknown, apiKey: unknown) => {
    assertFromUi(event);
    const status = store.save(AiProviderSchema.parse(provider), String(apiKey));
    await applyToBackend();
    return status;
  });

  ipcMain.handle('careerly:ai-keys:remove', async (event, provider: unknown) => {
    assertFromUi(event);
    const status = store.remove(AiProviderSchema.parse(provider));
    await applyToBackend();
    return status;
  });

  ipcMain.handle('careerly:ai-keys:set-active', async (event, provider: unknown) => {
    assertFromUi(event);
    const status = store.setActive(AiProviderSchema.parse(provider));
    await applyToBackend();
    return status;
  });
}

/** The data folder the API is using (in development it is `.data/`, not `userData`). */
async function fetchDataDir(connection: Connection): Promise<string> {
  const response = await fetch(`${connection.apiBaseUrl}/settings`, {
    headers: { Authorization: `Bearer ${connection.apiToken}` },
  });
  const body = (await response.json()) as { dataDir?: unknown };
  if (!response.ok || typeof body.dataDir !== 'string' || !path.isAbsolute(body.dataDir)) {
    throw new Error('The API did not report a valid data folder.');
  }
  return body.dataDir;
}

/** `npm start` / installed app: start the API ourselves and serve the built UI. */
async function packagedConnection(): Promise<Connection> {
  const apiToken = randomBytes(32).toString('base64url');
  const controlToken = randomBytes(32).toString('base64url');
  // TODO(roadmap 1.4): resolve the API and UI from `process.resourcesPath` in the installer build.
  const appsDir = path.resolve(here, '..', '..');

  backend = await startBackend({
    entry: path.join(appsDir, 'api', 'dist', 'main.js'),
    dataDir: app.getPath('userData'),
    token: apiToken,
    controlToken,
    appVersion: app.getVersion(),
    allowedOrigins: [APP_ORIGIN],
    forwardOutput: !app.isPackaged,
  });
  serveUi(path.join(appsDir, 'web', 'dist'), backend.url);

  return { uiUrl: `${APP_ORIGIN}/index.html`, apiBaseUrl: backend.url, apiToken, controlToken };
}

/** `npm run dev`: Vite serves the UI with HMR and the API runs separately in watch mode. */
async function developmentConnection(): Promise<Connection> {
  process.loadEnvFile(path.resolve(here, '..', '.env.development'));
  const uiUrl = requiredEnv('CAREERLY_DEV_SERVER_URL');
  await waitForUrl(uiUrl);
  return {
    uiUrl,
    apiBaseUrl: requiredEnv('CAREERLY_API_URL'),
    apiToken: requiredEnv('CAREERLY_API_TOKEN'),
    controlToken: requiredEnv('CAREERLY_CONTROL_TOKEN'),
  };
}

function createWindow(url: string) {
  const window = new BrowserWindow({
    title: 'Careerly',
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#f6f6f8',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  window.once('ready-to-show', () => window.show());
  void window.loadURL(url);
}

app.on('window-all-closed', () => app.quit());

app.on('before-quit', (event) => {
  if (!backend || quitting) return;
  // Stop the API gracefully (closes the database) before exiting.
  event.preventDefault();
  quitting = true;
  void backend.stop().finally(() => app.quit());
});

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in apps/desktop/.env.development.`);
  return value;
}

async function waitForUrl(url: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error(`${url} did not respond. Is the Vite dev server running?`);
}
