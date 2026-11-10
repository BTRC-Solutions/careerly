import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';

export const APP_SCHEME = 'app';
export const APP_ORIGIN = `${APP_SCHEME}://careerly`;

/** Must run before `app.whenReady()`. */
export function registerAppScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/**
 * Serves the built UI (`apps/web/dist`) from `app://careerly/`, with a strict Content Security Policy.
 * Unknown paths fall back to `index.html`; paths outside the UI folder are rejected.
 */
export function serveUi(uiRoot: string, apiUrl: string) {
  const root = path.resolve(uiRoot);
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data:",
    `connect-src 'self' ${apiUrl}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');

  protocol.handle(APP_SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    const requested = path.resolve(root, `.${decodeURIComponent(pathname)}`);
    if (requested !== root && !requested.startsWith(`${root}${path.sep}`)) {
      return new Response('Not found', { status: 404 });
    }

    const file =
      fs.existsSync(requested) && fs.statSync(requested).isFile()
        ? requested
        : path.join(root, 'index.html');
    const response = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', csp);
    return new Response(response.body, { status: response.status, headers });
  });
}
