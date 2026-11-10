/**
 * Single bridge between the UI and the Electron shell.
 * The rest of the UI must not know whether it runs inside Electron or in a regular browser.
 */

/** What the preload script exposes on `window.careerly` (see apps/desktop/src/preload.cts). */
export interface DesktopBridge {
  apiBaseUrl: string;
  apiToken: string;
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
