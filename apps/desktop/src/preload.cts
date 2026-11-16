import { contextBridge, ipcRenderer } from 'electron';

/**
 * Exposes the minimum the UI needs (see apps/web/src/shared/desktop.ts).
 * The renderer has no Node access: contextIsolation and sandbox are on. A sandboxed preload can only
 * use `electron`, so the types below are local copies of the shared contracts.
 */
interface ApiConnection {
  apiBaseUrl: string;
  apiToken: string;
}

type AiProvider = 'gemini' | 'anthropic';

interface AiKeysStatus {
  activeProvider: AiProvider | null;
  configured: Record<AiProvider, boolean>;
  secureStorageAvailable: boolean;
}

interface RestoredBackup {
  createdAt: string;
  appVersion: string;
  fileCount: number;
}

const connection = ipcRenderer.sendSync('careerly:get-api-connection') as ApiConnection;

contextBridge.exposeInMainWorld('careerly', {
  apiBaseUrl: connection.apiBaseUrl,
  apiToken: connection.apiToken,
  /** Opens the data folder in the system file manager. Main decides which folder. */
  openDataFolder: (): Promise<void> => ipcRenderer.invoke('careerly:open-data-folder'),
  /**
   * AI API keys (RF-CONF-01): write-only from the interface. There is no way to read a key back;
   * the status only says which providers have one and which is active.
   */
  aiKeys: {
    status: (): Promise<AiKeysStatus> => ipcRenderer.invoke('careerly:ai-keys:status'),
    save: (provider: AiProvider, apiKey: string): Promise<AiKeysStatus> =>
      ipcRenderer.invoke('careerly:ai-keys:save', provider, apiKey),
    remove: (provider: AiProvider): Promise<AiKeysStatus> =>
      ipcRenderer.invoke('careerly:ai-keys:remove', provider),
    setActive: (provider: AiProvider): Promise<AiKeysStatus> =>
      ipcRenderer.invoke('careerly:ai-keys:set-active', provider),
  },
  /**
   * Backups and data deletion (RF-CONF-04, RF-CONF-05) with native dialogs. Main chooses the files
   * with the user; the interface never passes a path.
   */
  data: {
    exportBackup: (): Promise<{ status: 'saved'; path: string } | { status: 'cancelled' }> =>
      ipcRenderer.invoke('careerly:data:export-backup'),
    restoreBackup: (): Promise<
      { status: 'restored'; restored: RestoredBackup } | { status: 'cancelled' }
    > => ipcRenderer.invoke('careerly:data:restore-backup'),
    deleteAll: (): Promise<void> => ipcRenderer.invoke('careerly:data:delete-all'),
  },
});
