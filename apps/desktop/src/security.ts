import { app, session, shell } from 'electron';

/**
 * Electron hardening that applies to every window:
 * - no new windows; http(s) links open in the system browser
 * - no navigation away from the app's own origin
 * - no permission prompts (camera, notifications, etc.)
 */
export function applySecurityPolicies(isAllowedUrl: (url: string) => boolean) {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );

  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      openExternally(url);
      return { action: 'deny' };
    });

    contents.on('will-navigate', (event, url) => {
      if (!isAllowedUrl(url)) {
        event.preventDefault();
        openExternally(url);
      }
    });

    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
}

function openExternally(url: string) {
  const { protocol } = new URL(url);
  if (protocol === 'https:' || protocol === 'http:') {
    void shell.openExternal(url);
  }
}
