import { randomBytes } from 'node:crypto';
import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AiProviderSchema } from '@careerly/contracts';
import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent, shell } from 'electron';
import { AiCredentialsSync } from './ai-credentials-sync.js';
import { AiKeyStore } from './ai-key-store.js';
import { APP_ORIGIN, registerAppScheme, serveUi } from './app-protocol.js';
import { startBackend, type RunningBackend } from './backend.js';
import { DataActions } from './data-actions.js';
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
// CAREERLY_USER_DATA_DIR points it elsewhere, for smoke tests of the installed app.
app.setName('Careerly');
app.setPath(
  'userData',
  process.env.CAREERLY_USER_DATA_DIR ?? path.join(app.getPath('appData'), 'Careerly'),
);
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

  const aiKeys = registerAiKeyHandlers(connection, assertFromUi);
  registerDataHandlers(connection, assertFromUi, aiKeys.clearAll);
  createWindow(connection.uiUrl);
}

/**
 * API keys per AI provider (ADR-23, RF-CONF-01, RNF-03). The renderer can save, remove and pick
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

  return {
    /** Removes every saved key (used when deleting all data, RF-CONF-05). */
    clearAll: async () => {
      for (const provider of AiProviderSchema.options) store.remove(provider);
      await applyToBackend();
    },
  };
}

/**
 * Backups and data deletion with native dialogs (RF-CONF-04, RF-CONF-05). The renderer only triggers
 * them: main picks the files with the user and talks to the API, so no path comes from the renderer.
 */
function registerDataHandlers(
  connection: Connection,
  assertFromUi: (event: IpcMainInvokeEvent) => void,
  clearAiKeys: () => Promise<void>,
) {
  const parentOf = (event: IpcMainInvokeEvent) => BrowserWindow.fromWebContents(event.sender);
  const actionsFor = (event: IpcMainInvokeEvent) =>
    new DataActions({
      apiBaseUrl: connection.apiBaseUrl,
      apiToken: connection.apiToken,
      chooseSavePath: async (defaultFileName) => {
        const options = {
          defaultPath: path.join(app.getPath('documents'), defaultFileName),
          filters: [{ name: 'Careerly backup', extensions: ['careerly-backup'] }],
        };
        const window = parentOf(event);
        const result = window
          ? await dialog.showSaveDialog(window, options)
          : await dialog.showSaveDialog(options);
        return result.canceled ? undefined : result.filePath;
      },
      chooseBackupFile: async () => {
        const options = {
          properties: ['openFile' as const],
          filters: [{ name: 'Careerly backup', extensions: ['careerly-backup'] }],
        };
        const window = parentOf(event);
        const result = window
          ? await dialog.showOpenDialog(window, options)
          : await dialog.showOpenDialog(options);
        return result.canceled ? undefined : result.filePaths[0];
      },
      copyFile,
      clearAiKeys,
    });

  ipcMain.handle('careerly:data:export-backup', (event) => {
    assertFromUi(event);
    return actionsFor(event).exportBackup();
  });
  ipcMain.handle('careerly:data:restore-backup', (event) => {
    assertFromUi(event);
    return actionsFor(event).restoreFromFile();
  });
  ipcMain.handle('careerly:data:delete-all', (event) => {
    assertFromUi(event);
    return actionsFor(event).deleteAllData();
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
  const paths = runtimePaths();

  backend = await startBackend({
    entry: paths.apiEntry,
    migrationsDir: paths.migrationsDir,
    typstBinary: paths.typstBinary,
    dataDir: app.getPath('userData'),
    token: apiToken,
    controlToken,
    appVersion: app.getVersion(),
    allowedOrigins: [APP_ORIGIN],
    forwardOutput: !app.isPackaged,
  });
  serveUi(paths.uiRoot, backend.url);

  return { uiUrl: `${APP_ORIGIN}/index.html`, apiBaseUrl: backend.url, apiToken, controlToken };
}

/**
 * Where the API, its migrations, Typst and the UI are. The installer puts them in `resources/` next to
 * app.asar (see `scripts/package-app.mjs`); from source they are the build outputs of the other apps, and the
 * API finds Typst by itself (the vendored one or the PATH's).
 */
function runtimePaths() {
  if (app.isPackaged) {
    const resources = process.resourcesPath;
    return {
      apiEntry: path.join(resources, 'api', 'main.mjs'),
      migrationsDir: path.join(resources, 'api', 'drizzle'),
      typstBinary: path.join(
        resources,
        'typst',
        process.platform === 'win32' ? 'typst.exe' : 'typst',
      ),
      uiRoot: path.join(resources, 'web'),
    };
  }
  const appsDir = path.resolve(here, '..', '..');
  return {
    apiEntry: path.join(appsDir, 'api', 'dist', 'main.js'),
    migrationsDir: path.join(appsDir, 'api', 'drizzle'),
    typstBinary: undefined,
    uiRoot: path.join(appsDir, 'web', 'dist'),
  };
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
    // Installed, the window takes the executable's icon (set by electron-builder).
    ...(app.isPackaged ? {} : { icon: path.join(here, '..', 'build', 'icon.png') }),
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
