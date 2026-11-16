/**
 * Single bridge between the UI and the Electron shell.
 * The rest of the UI must not know whether it runs inside Electron or in a regular browser.
 */

import type { AiKeysStatus, AiProvider, RestoreBackupResponse } from '@careerly/contracts';

/**
 * AI API keys kept by Electron's main process (RF-CONF-01, ADR-23). Write-only: the interface can
 * save, remove and choose the active provider, and see which ones are configured, never the keys.
 */
export interface DesktopAiKeys {
  status(): Promise<AiKeysStatus>;
  save(provider: AiProvider, apiKey: string): Promise<AiKeysStatus>;
  remove(provider: AiProvider): Promise<AiKeysStatus>;
  setActive(provider: AiProvider): Promise<AiKeysStatus>;
}

/**
 * Backups and data deletion with native dialogs (RF-CONF-04, RF-CONF-05). Main picks the files with
 * the user; the interface never passes a path.
 */
export interface DesktopData {
  exportBackup(): Promise<{ status: 'saved'; path: string } | { status: 'cancelled' }>;
  restoreBackup(): Promise<
    { status: 'restored'; restored: RestoreBackupResponse['restored'] } | { status: 'cancelled' }
  >;
  /** Deletes the database, files, backups and the saved AI keys. */
  deleteAll(): Promise<void>;
}

/** What the preload script exposes on `window.careerly` (see apps/desktop/src/preload.cts). */
export interface DesktopBridge {
  apiBaseUrl: string;
  apiToken: string;
  /** Opens the local data folder in the system file manager (RF-CONF-03). */
  openDataFolder?: () => Promise<void>;
  aiKeys?: DesktopAiKeys;
  data?: DesktopData;
}

/** Native actions available only inside Electron. Empty in `npm run dev:web`. */
export interface DesktopActions {
  openDataFolder?: () => Promise<void>;
  aiKeys?: DesktopAiKeys;
  data?: DesktopData;
}

export function getDesktopActions(): DesktopActions {
  return {
    openDataFolder: window.careerly?.openDataFolder,
    aiKeys: window.careerly?.aiKeys,
    data: window.careerly?.data,
  };
}

export interface ApiConnection {
  baseUrl: string;
  token: string;
  /** `true` inside Electron, `false` in `npm run dev:web`. */
  isDesktop: boolean;
}

declare global {
  interface Window {
    careerly?: DesktopBridge;
  }
}

export function resolveApiConnection(
  bridge: DesktopBridge | undefined,
  env: { VITE_API_URL?: string; VITE_API_TOKEN?: string },
): ApiConnection {
  if (bridge) {
    return { baseUrl: bridge.apiBaseUrl, token: bridge.apiToken, isDesktop: true };
  }
  if (env.VITE_API_URL && env.VITE_API_TOKEN) {
    return { baseUrl: env.VITE_API_URL, token: env.VITE_API_TOKEN, isDesktop: false };
  }
  throw new Error(
    'No API connection: run the UI inside Electron, or set VITE_API_URL and VITE_API_TOKEN.',
  );
}

let cached: ApiConnection | undefined;

/** The connection for this window (resolved once, on first use). */
export function getApiConnection(): ApiConnection {
  cached ??= resolveApiConnection(window.careerly, import.meta.env);
  return cached;
}
