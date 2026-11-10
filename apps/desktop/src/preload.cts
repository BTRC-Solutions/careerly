import { contextBridge, ipcRenderer } from 'electron';

/**
 * Exposes the minimum the UI needs (see apps/web/src/shared/desktop.ts).
 * The renderer has no Node access: contextIsolation and sandbox are on.
 */
interface ApiConnection {
  apiBaseUrl: string;
  apiToken: string;
}

const connection = ipcRenderer.sendSync('careerly:get-api-connection') as ApiConnection;

contextBridge.exposeInMainWorld('careerly', {
  apiBaseUrl: connection.apiBaseUrl,
  apiToken: connection.apiToken,
});
